/**
 * PandaClaw 容错层入口
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 
 * 模块:
 * - CircuitBreaker - 熔断器
 * - RetryPolicy - 重试策略
 * - DeadLetterQueue - 死信队列
 * - HealthChecker - 健康检查
 */

const {
  CircuitBreakerManager,
  CIRCUIT_BREAKER_CONFIG,
  createBreakerManager,
} = require('./circuit-breaker');

const {
  RetryPolicy,
  RetryStrategies,
  RETRY_CONFIG,
  createRetryPolicy,
} = require('./retry-policy');

const {
  DeadLetterQueue,
  DLQ_CONFIG,
  createDLQ,
} = require('./dead-letter-queue');

const {
  HealthChecker,
  HEALTH_CONFIG,
  DependencyCheckers,
  createHealthChecker,
} = require('./health-checker');

// ============================================
// 容错层组合器
// ============================================

class ResilienceLayer {
  constructor(redisClient, config = {}) {
    this.redis = redisClient;
    this.config = config;
    
    // 初始化各模块
    this.breakerManager = createBreakerManager(redisClient);
    this.retryPolicy = createRetryPolicy(config.retry);
    this.dlq = createDLQ(redisClient, config.dlq);
    this.healthChecker = createHealthChecker(redisClient, config.health);
    
    // 注册依赖检查
    this.healthChecker.registerDependency('redis', {
      type: 'redis',
      checkFn: DependencyCheckers.redis(redisClient),
      critical: true,
    });
    
    // 事件转发
    this.breakerManager.on('stateChange', (event) => {
      this.emit('circuitBreakerStateChange', event);
    });
    
    this.dlq.on('added', (event) => {
      this.emit('deadLetterAdded', event);
    });
    
    this.healthChecker.on('criticalDependencyFailed', (event) => {
      this.emit('criticalDependencyFailed', event);
    });
  }
  
  /**
   * 创建受保护的调用
   * @param {string} serviceId - 服务 ID
   * @param {Function} fn - 要执行的函数
   * @param {Object} options - 选项
   */
  async protectedCall(serviceId, fn, options = {}) {
    // 创建熔断器
    const breaker = this.breakerManager.create(serviceId, fn, options.breaker);
    
    // 设置降级函数
    if (options.fallback) {
      breaker.fallback(options.fallback);
    }
    
    // 执行带重试的调用
    return this.retryPolicy.execute(
      () => breaker.fire(options.args),
      { maxRetries: options.maxRetries }
    );
  }
  
  /**
   * 处理失败
   * @param {Object} event - 原始事件
   * @param {string} reason - 失败原因
   */
  async handleFailure(event, reason) {
    const retryCount = event.metadata?.retryCount || 0;
    
    // 添加到死信队列
    const dlqId = await this.dlq.add(event, reason, retryCount);
    
    return dlqId;
  }
  
  /**
   * 获取系统健康报告
   */
  async getHealthReport() {
    const breakerHealth = this.breakerManager.healthCheck();
    const agentHealth = await this.healthChecker.performFullCheck();
    
    return {
      overall: breakerHealth.healthy && agentHealth.healthy,
      circuitBreakers: breakerHealth,
      agents: agentHealth,
      timestamp: Date.now(),
    };
  }
  
  /**
   * 关闭所有模块
   */
  async close() {
    await this.dlq.close();
    await this.healthChecker.close();
    this.emit('closed');
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  // 模块
  CircuitBreakerManager,
  RetryPolicy,
  DeadLetterQueue,
  HealthChecker,
  
  // 配置
  CIRCUIT_BREAKER_CONFIG,
  RETRY_CONFIG,
  DLQ_CONFIG,
  HEALTH_CONFIG,
  
  // 工厂函数
  createBreakerManager,
  createRetryPolicy,
  createDLQ,
  createHealthChecker,
  
  // 组合器
  ResilienceLayer,
  
  // 便捷创建
  createResilienceLayer: (redisClient, config) => new ResilienceLayer(redisClient, config),
  
  // 预定义策略
  RetryStrategies,
  DependencyCheckers,
};