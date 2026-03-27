/**
 * PandaClaw Prometheus 指标收集模块
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 
 * 功能:
 * - 消息指标
 * - 熔断器指标
 * - Agent 活跃指标
 * - 队列指标
 */

const Prometheus = require('prom-client');
const { EventEmitter } = require('events');

// ============================================
// 指标配置
// ============================================

const METRICS_CONFIG = {
  prefix: 'pandaclaw_',          // 指标前缀
  defaultLabels: {
    service: 'pandaclaw',
    version: '1.0.0',
  },
  collectInterval: 15000,        // 收集间隔 15秒
};

// ============================================
// 指标收集器类
// ============================================

class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...METRICS_CONFIG, ...config };
    this.registry = new Prometheus.Registry();
    
    // 设置默认标签
    this.registry.setDefaultLabels(this.config.defaultLabels);
    
    // 初始化指标
    this.initMetrics();
    
    // 启动默认指标收集
    Prometheus.collectDefaultMetrics({ register: this.registry });
  }
  
  /**
   * 初始化所有指标
   */
  initMetrics() {
    // ============================================
    // 消息指标
    // ============================================
    
    this.metrics = {
      // 消息计数
      messagesTotal: new Prometheus.Counter({
        name: `${this.config.prefix}messages_total`,
        help: 'Total number of messages processed',
        labelNames: ['type', 'status', 'meeting_id'],
      }),
      
      // 消息延迟
      messageLatency: new Prometheus.Histogram({
        name: `${this.config.prefix}message_latency_ms`,
        help: 'Message processing latency in milliseconds',
        labelNames: ['type', 'meeting_id'],
        buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      }),
      
      // 消息队列大小
      queueSize: new Prometheus.Gauge({
        name: `${this.config.prefix}queue_size`,
        help: 'Current queue size',
        labelNames: ['queue_name'],
      }),
      
      // ============================================
      // 熔断器指标
      // ============================================
      
      // 熔断器状态
      circuitBreakerState: new Prometheus.Gauge({
        name: `${this.config.prefix}circuit_breaker_state`,
        help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
        labelNames: ['service_id'],
      }),
      
      // 熔断器失败计数
      circuitBreakerFailures: new Prometheus.Counter({
        name: `${this.config.prefix}circuit_breaker_failures_total`,
        help: 'Total circuit breaker failures',
        labelNames: ['service_id'],
      }),
      
      // 熔断器成功计数
      circuitBreakerSuccesses: new Prometheus.Counter({
        name: `${this.config.prefix}circuit_breaker_successes_total`,
        help: 'Total circuit breaker successes',
        labelNames: ['service_id'],
      }),
      
      // ============================================
      // Agent 活跃指标
      // ============================================
      
      // Agent 数量
      agentsActive: new Prometheus.Gauge({
        name: `${this.config.prefix}agents_active`,
        help: 'Number of active agents',
        labelNames: ['role', 'status'],
      }),
      
      // Agent 心跳延迟
      agentHeartbeatLatency: new Prometheus.Histogram({
        name: `${this.config.prefix}agent_heartbeat_latency_ms`,
        help: 'Agent heartbeat latency in milliseconds',
        labelNames: ['agent_id'],
        buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
      }),
      
      // Agent 消息处理数
      agentMessagesProcessed: new Prometheus.Counter({
        name: `${this.config.prefix}agent_messages_processed_total`,
        help: 'Total messages processed by agent',
        labelNames: ['agent_id', 'type'],
      }),
      
      // ============================================
      // 会议指标
      // ============================================
      
      // 会议数量
      meetingsTotal: new Prometheus.Counter({
        name: `${this.config.prefix}meetings_total`,
        help: 'Total number of meetings',
        labelNames: ['type', 'status'],
      }),
      
      // 会议持续时间
      meetingDuration: new Prometheus.Histogram({
        name: `${this.config.prefix}meeting_duration_ms`,
        help: 'Meeting duration in milliseconds',
        labelNames: ['type', 'complexity'],
        buckets: [60000, 300000, 600000, 1800000, 3600000, 7200000],
      }),
      
      // 会议步骤耗时
      meetingStepDuration: new Prometheus.Histogram({
        name: `${this.config.prefix}meeting_step_duration_ms`,
        help: 'Meeting step duration in milliseconds',
        labelNames: ['step', 'meeting_id'],
        buckets: [1000, 5000, 10000, 30000, 60000, 120000, 300000],
      }),
      
      // ============================================
      // 死信队列指标
      // ============================================
      
      // 死信队列大小
      dlqSize: new Prometheus.Gauge({
        name: `${this.config.prefix}dlq_size`,
        help: 'Dead letter queue size',
        labelNames: ['status'],
      }),
      
      // 死信添加计数
      dlqAdded: new Prometheus.Counter({
        name: `${this.config.prefix}dlq_added_total`,
        help: 'Total dead letters added',
        labelNames: ['event_type', 'failure_reason'],
      }),
      
      // 死信重放计数
      dlqReplayed: new Prometheus.Counter({
        name: `${this.config.prefix}dlq_replayed_total`,
        help: 'Total dead letters replayed',
        labelNames: ['status'],  // success | failed
      }),
      
      // ============================================
      // 重试指标
      // ============================================
      
      // 重试计数
      retriesTotal: new Prometheus.Counter({
        name: `${this.config.prefix}retries_total`,
        help: 'Total number of retries',
        labelNames: ['service_id', 'attempt', 'result'],
      }),
      
      // 重试延迟
      retryDelay: new Prometheus.Histogram({
        name: `${this.config.prefix}retry_delay_ms`,
        help: 'Retry delay in milliseconds',
        labelNames: ['service_id'],
        buckets: [100, 500, 1000, 2000, 5000, 10000, 20000, 30000],
      }),
      
      // ============================================
      // 系统指标
      // ============================================
      
      // 健康状态
      systemHealth: new Prometheus.Gauge({
        name: `${this.config.prefix}system_health`,
        help: 'System health status (0=unhealthy, 1=healthy)',
        labelNames: ['component'],
      }),
      
      // 令牌池状态
      tokenPoolAvailable: new Prometheus.Gauge({
        name: `${this.config.prefix}token_pool_available`,
        help: 'Available tokens in pool',
      }),
      
      tokenPoolWaiting: new Prometheus.Gauge({
        name: `${this.config.prefix}token_pool_waiting`,
        help: 'Waiting requests in pool',
      }),
    };
    
    // 注册所有指标
    for (const metric of Object.values(this.metrics)) {
      this.registry.registerMetric(metric);
    }
  }
  
  // ============================================
  // 消息指标记录
  // ============================================
  
  /**
   * 记录消息处理
   * @param {string} type - 消息类型
   * @param {string} status - 处理状态
   * @param {string} meetingId - 会议 ID
   * @param {number} latency - 处理延迟 ms
   */
  recordMessage(type, status, meetingId, latency) {
    this.metrics.messagesTotal.inc({ type, status, meeting_id: meetingId });
    if (latency) {
      this.metrics.messageLatency.observe({ type, meeting_id: meetingId }, latency);
    }
  }
  
  /**
   * 更新队列大小
   * @param {string} queueName - 队列名
   * @param {number} size - 大小
   */
  updateQueueSize(queueName, size) {
    this.metrics.queueSize.set({ queue_name: queueName }, size);
  }
  
  // ============================================
  // 熔断器指标记录
  // ============================================
  
  /**
   * 更新熔断器状态
   * @param {string} serviceId - 服务 ID
   * @param {string} state - 状态 (closed/half-open/open)
   */
  updateCircuitBreakerState(serviceId, state) {
    const stateValue = { 'closed': 0, 'half-open': 1, 'open': 2 }[state] || 0;
    this.metrics.circuitBreakerState.set({ service_id: serviceId }, stateValue);
  }
  
  /**
   * 记录熔断器失败
   * @param {string} serviceId - 服务 ID
   */
  recordCircuitBreakerFailure(serviceId) {
    this.metrics.circuitBreakerFailures.inc({ service_id: serviceId });
  }
  
  /**
   * 记录熔断器成功
   * @param {string} serviceId - 服务 ID
   */
  recordCircuitBreakerSuccess(serviceId) {
    this.metrics.circuitBreakerSuccesses.inc({ service_id: serviceId });
  }
  
  // ============================================
  // Agent 指标记录
  // ============================================
  
  /**
   * 更新 Agent 数量
   * @param {string} role - 角色
   * @param {string} status - 状态
   * @param {number} count - 数量
   */
  updateAgentsCount(role, status, count) {
    this.metrics.agentsActive.set({ role, status }, count);
  }
  
  /**
   * 记录 Agent 心跳延迟
   * @param {string} agentId - Agent ID
   * @param {number} latency - 延迟 ms
   */
  recordAgentHeartbeatLatency(agentId, latency) {
    this.metrics.agentHeartbeatLatency.observe({ agent_id: agentId }, latency);
  }
  
  /**
   * 记录 Agent 消息处理
   * @param {string} agentId - Agent ID
   * @param {string} type - 消息类型
   */
  recordAgentMessage(agentId, type) {
    this.metrics.agentMessagesProcessed.inc({ agent_id: agentId, type });
  }
  
  // ============================================
  // 会议指标记录
  // ============================================
  
  /**
   * 记录会议创建
   * @param {string} type - 会议类型
   * @param {string} status - 状态
   */
  recordMeeting(type, status) {
    this.metrics.meetingsTotal.inc({ type, status });
  }
  
  /**
   * 记录会议持续时间
   * @param {string} type - 会议类型
   * @param {string} complexity - 复杂度
   * @param {number} duration - 持续时间 ms
   */
  recordMeetingDuration(type, complexity, duration) {
    this.metrics.meetingDuration.observe({ type, complexity }, duration);
  }
  
  /**
   * 记录会议步骤耗时
   * @param {number} step - 步骤号
   * @param {string} meetingId - 会议 ID
   * @param {number} duration - 耗时 ms
   */
  recordMeetingStepDuration(step, meetingId, duration) {
    this.metrics.meetingStepDuration.observe({ step, meeting_id: meetingId }, duration);
  }
  
  // ============================================
  // 死信队列指标记录
  // ============================================
  
  /**
   * 更新死信队列大小
   * @param {string} status - 状态
   * @param {number} size - 大小
   */
  updateDLQSize(status, size) {
    this.metrics.dlqSize.set({ status }, size);
  }
  
  /**
   * 记录死信添加
   * @param {string} eventType - 事件类型
   * @param {string} failureReason - 失败原因
   */
  recordDLQAdded(eventType, failureReason) {
    this.metrics.dlqAdded.inc({ event_type: eventType, failure_reason: failureReason });
  }
  
  /**
   * 记录死信重放
   * @param {string} status - 结果状态
   */
  recordDLQReplayed(status) {
    this.metrics.dlqReplayed.inc({ status });
  }
  
  // ============================================
  // 重试指标记录
  // ============================================
  
  /**
   * 记录重试
   * @param {string} serviceId - 服务 ID
   * @param {number} attempt - 尝试次数
   * @param {string} result - 结果
   * @param {number} delay - 延迟 ms
   */
  recordRetry(serviceId, attempt, result, delay) {
    this.metrics.retriesTotal.inc({ service_id: serviceId, attempt, result });
    if (delay) {
      this.metrics.retryDelay.observe({ service_id: serviceId }, delay);
    }
  }
  
  // ============================================
  // 系统指标记录
  // ============================================
  
  /**
   * 更新健康状态
   * @param {string} component - 组件名
   * @param {boolean} healthy - 健康状态
   */
  updateHealth(component, healthy) {
    this.metrics.systemHealth.set({ component }, healthy ? 1 : 0);
  }
  
  /**
   * 更新令牌池状态
   * @param {number} available - 可用令牌
   * @param {number} waiting - 等待请求
   */
  updateTokenPool(available, waiting) {
    this.metrics.tokenPoolAvailable.set(available);
    this.metrics.tokenPoolWaiting.set(waiting);
  }
  
  // ============================================
  // 导出接口
  // ============================================
  
  /**
   * 获取 Prometheus 指标输出
   * @returns {Promise<string>}
   */
  async getMetrics() {
    return this.registry.metrics();
  }
  
  /**
   * 获取 Registry（用于自定义 endpoint）
   */
  getRegistry() {
    return this.registry;
  }
  
  /**
   * 清除所有指标（用于测试）
   */
  clearMetrics() {
    this.registry.clear();
    this.initMetrics();
  }
  
  /**
   * 获取指标概览
   */
  getOverview() {
    return {
      prefix: this.config.prefix,
      metricsCount: Object.keys(this.metrics).length,
      metrics: Object.keys(this.metrics),
    };
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  MetricsCollector,
  METRICS_CONFIG,
  
  // 快捷工厂函数
  createMetricsCollector: (config) => new MetricsCollector(config),
};