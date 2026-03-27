/**
 * PandaClaw 熔断器模块
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 基于契约: contracts/events.ts - CircuitBreakerEvent
 * 
 * 配置:
 * - errorThreshold: 50%
 * - timeout: 30s
 */

const CircuitBreaker = require('opossum');
const { EventEmitter } = require('events');

// 从契约导入（TypeScript 文件需要编译，这里使用常量定义）
const EVENT_CHANNELS = {
  MEETING_EVENTS: 'pandaclaw:meeting:events',
  AGENT_EVENTS: 'pandaclaw:agent:events',
  SYSTEM_EVENTS: 'pandaclaw:system:events',
};

// ============================================
// 熔断器配置
// ============================================

const CIRCUIT_BREAKER_CONFIG = {
  // 默认配置
  default: {
    errorThreshold: 0.5,        // 50% 错误率触发熔断
    timeout: 30000,             // 30秒超时
    resetTimeout: 30000,        // 30秒后尝试半开
    volumeThreshold: 10,        // 最少10次请求后才计算错误率
    halfOpenMaxRequests: 3,     // 半开状态最多3次试探请求
  },
  
  // 服务级配置（可覆盖）
  services: {
    'openclaw-session': {
      errorThreshold: 0.5,
      timeout: 30000,
    },
    'redis-stream': {
      errorThreshold: 0.6,
      timeout: 10000,
    },
    'llm-call': {
      errorThreshold: 0.5,
      timeout: 60000,
    },
  }
};

// ============================================
// 熔断器管理器
// ============================================

class CircuitBreakerManager extends EventEmitter {
  constructor(redisClient = null) {
    super();
    this.breakers = new Map();
    this.redis = redisClient;
    this.stats = new Map();
  }
  
  /**
   * 创建或获取熔断器
   * @param {string} serviceId - 服务标识
   * @param {Function} fn - 要保护的函数
   * @param {Object} options - 可选配置
   */
  create(serviceId, fn, options = {}) {
    if (this.breakers.has(serviceId)) {
      return this.breakers.get(serviceId);
    }
    
    // 合并配置
    const serviceConfig = CIRCUIT_BREAKER_CONFIG.services[serviceId] || {};
    const config = {
      ...CIRCUIT_BREAKER_CONFIG.default,
      ...serviceConfig,
      ...options,
    };
    
    const breaker = new CircuitBreaker(fn, {
      errorThresholdPercentage: config.errorThreshold * 100,
      timeout: config.timeout,
      resetTimeout: config.resetTimeout,
      volumeThreshold: config.volumeThreshold,
      capacity: config.halfOpenMaxRequests * 2,
    });
    
    // 事件监听
    breaker.on('open', () => {
      this.emitStateChange(serviceId, 'open');
      this.recordFailure(serviceId, 'Circuit opened');
    });
    
    breaker.on('halfOpen', () => {
      this.emitStateChange(serviceId, 'half-open');
    });
    
    breaker.on('close', () => {
      this.emitStateChange(serviceId, 'closed');
    });
    
    breaker.on('fallback', (result) => {
      this.stats.set(serviceId, {
        ...this.getStats(serviceId),
        fallbackCount: (this.stats.get(serviceId)?.fallbackCount || 0) + 1,
      });
    });
    
    breaker.on('failure', (error) => {
      this.recordFailure(serviceId, error.message);
    });
    
    breaker.on('success', () => {
      this.stats.set(serviceId, {
        ...this.getStats(serviceId),
        successCount: (this.stats.get(serviceId)?.successCount || 0) + 1,
        lastSuccess: Date.now(),
      });
    });
    
    this.breakers.set(serviceId, breaker);
    this.stats.set(serviceId, {
      serviceId,
      state: 'closed',
      successCount: 0,
      failureCount: 0,
      fallbackCount: 0,
      lastFailure: null,
    });
    
    return breaker;
  }
  
  /**
   * 获取熔断器
   */
  get(serviceId) {
    return this.breakers.get(serviceId);
  }
  
  /**
   * 调用受保护的服务
   */
  async call(serviceId, ...args) {
    const breaker = this.breakers.get(serviceId);
    if (!breaker) {
      throw new Error(`Circuit breaker not found: ${serviceId}`);
    }
    return breaker.fire(...args);
  }
  
  /**
   * 获取熔断器状态
   */
  getState(serviceId) {
    const breaker = this.breakers.get(serviceId);
    if (!breaker) return null;
    
    const stats = breaker.stats;
    return {
      state: breaker.opened ? 'open' : (breaker.halfOpen ? 'half-open' : 'closed'),
      failures: stats.failures,
      successes: stats.successes,
      fallbacks: stats.fallbacks,
      rejects: stats.rejects,
    };
  }
  
  /**
   * 获取统计数据
   */
  getStats(serviceId) {
    return this.stats.get(serviceId) || null;
  }
  
  /**
   * 获取所有熔断器状态
   */
  getAllStates() {
    const states = {};
    for (const [serviceId, breaker] of this.breakers) {
      states[serviceId] = this.getState(serviceId);
    }
    return states;
  }
  
  /**
   * 手动打开熔断器
   */
  open(serviceId) {
    const breaker = this.breakers.get(serviceId);
    if (breaker) {
      breaker.open();
    }
  }
  
  /**
   * 手动关闭熔断器
   */
  close(serviceId) {
    const breaker = this.breakers.get(serviceId);
    if (breaker) {
      breaker.close();
    }
  }
  
  /**
   * 发送状态变更事件
   */
  async emitStateChange(serviceId, state) {
    const event = {
      version: 1,
      serviceId,
      state,
      failureCount: this.getStats(serviceId)?.failureCount || 0,
      lastFailure: this.getStats(serviceId)?.lastFailure,
    };
    
    this.emit('stateChange', event);
    
    // 发布到 Redis
    if (this.redis) {
      try {
        await this.redis.xadd(
          EVENT_CHANNELS.SYSTEM_EVENTS,
          '*',
          'eventType', 'circuitBreaker:stateChange',
          'serviceId', serviceId,
          'state', state,
          'data', JSON.stringify(event)
        );
      } catch (err) {
        // Redis 失败不阻塞熔断器
        console.error('Failed to publish circuit breaker event:', err.message);
      }
    }
  }
  
  /**
   * 记录失败
   */
  recordFailure(serviceId, reason) {
    const stats = this.stats.get(serviceId) || {};
    this.stats.set(serviceId, {
      ...stats,
      failureCount: (stats.failureCount || 0) + 1,
      lastFailure: {
        error: reason,
        timestamp: Date.now(),
      },
    });
  }
  
  /**
   * 健康检查
   */
  healthCheck() {
    const health = {
      healthy: true,
      breakers: {},
      summary: {
        total: this.breakers.size,
        open: 0,
        halfOpen: 0,
        closed: 0,
      },
    };
    
    for (const [serviceId, breaker] of this.breakers) {
      const state = this.getState(serviceId);
      health.breakers[serviceId] = state;
      
      if (state.state === 'open') {
        health.healthy = false;
        health.summary.open++;
      } else if (state.state === 'half-open') {
        health.summary.halfOpen++;
      } else {
        health.summary.closed++;
      }
    }
    
    return health;
  }
  
  /**
   * 设置降级函数
   */
  setFallback(serviceId, fallbackFn) {
    const breaker = this.breakers.get(serviceId);
    if (breaker) {
      breaker.fallback(fallbackFn);
    }
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  CircuitBreakerManager,
  CIRCUIT_BREAKER_CONFIG,
  
  // 快捷工厂函数
  createBreakerManager: (redisClient) => new CircuitBreakerManager(redisClient),
};