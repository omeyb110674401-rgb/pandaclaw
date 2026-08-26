/**
 * PandaClaw 可观测层入口
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 
 * 模块:
 * - MetricsCollector - Prometheus 指标收集
 * - AlertManager - 告警管理
 */

const {
  MetricsCollector,
  METRICS_CONFIG,
  createMetricsCollector,
} = require('./metrics-collector');

const {
  AlertManager,
  AlertNotifier,
  ALERT_CONFIG,
  ALERT_RULES,
  SEVERITY_LEVELS,
  createAlertManager,
} = require('./alert-manager');

// ============================================
// 可观测层组合器
// ============================================

class ObservabilityLayer {
  constructor(redisClient, config = {}) {
    this.redis = redisClient;
    this.config = config;
    
    // 初始化模块
    this.metricsCollector = createMetricsCollector(config.metrics);
    this.alertManager = createAlertManager(redisClient, this.metricsCollector, config.alert);
    this.alertNotifier = new AlertNotifier(this.alertManager);
    
    // 注册默认通知通道
    this.registerDefaultChannels();
    
    // 事件转发
    this.alertManager.on('alertTriggered', (alert) => {
      this.emit('alertTriggered', alert);
    });
  }
  
  /**
   * 注册默认通知通道
   */
  registerDefaultChannels() {
    // 日志通道
    this.alertNotifier.registerChannel('log', (alert) => {
      const level = alert.severity === 'critical' ? 'error' : 
                    alert.severity === 'warning' ? 'warn' : 'info';
      console[level](`[${alert.severity.toUpperCase()}] ${alert.name}: ${alert.message}`);
    });
    
    // Redis 事件通道
    this.alertNotifier.registerChannel('redis', async (alert) => {
      try {
        await this.redis.xadd(
          'pandaclaw:alerts:events',
          '*',
          'alertId', alert.id,
          'severity', alert.severity,
          'message', alert.message,
          'triggeredAt', alert.triggeredAt.toString()
        );
      } catch (error) {
        console.error('Failed to publish alert to Redis:', error.message);
      }
    });
  }
  
  /**
   * 注册自定义通知通道
   * @param {string} channel - 通道名
   * @param {Function} handler - 处理函数
   */
  registerChannel(channel, handler) {
    this.alertNotifier.registerChannel(channel, handler);
  }
  
  /**
   * 获取 Prometheus 指标输出
   * @returns {Promise<string>}
   */
  async getMetrics() {
    return this.metricsCollector.getMetrics();
  }
  
  /**
   * 获取活跃告警
   * @param {Object} filter - 筛选条件
   */
  async getActiveAlerts(filter = {}) {
    return this.alertManager.getActiveAlerts(filter);
  }
  
  /**
   * 确认告警
   * @param {string} alertId - 告警 ID
   * @param {string} acknowledgedBy - 确认人
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    return this.alertManager.acknowledgeAlert(alertId, acknowledgedBy);
  }
  
  /**
   * 解决告警
   * @param {string} alertId - 告警 ID
   */
  async resolveAlert(alertId) {
    return this.alertManager.resolveAlert(alertId);
  }
  
  /**
   * 记录指标（便捷方法）
   */
  recordMetric(type, data) {
    switch (type) {
      case 'message':
        this.metricsCollector.recordMessage(
          data.type, data.status, data.meetingId, data.latency
        );
        break;
      case 'circuitBreaker':
        if (data.state) {
          this.metricsCollector.updateCircuitBreakerState(data.serviceId, data.state);
        }
        if (data.success) {
          this.metricsCollector.recordCircuitBreakerSuccess(data.serviceId);
        }
        if (data.failure) {
          this.metricsCollector.recordCircuitBreakerFailure(data.serviceId);
        }
        break;
      case 'agent':
        this.metricsCollector.recordAgentHeartbeatLatency(data.agentId, data.latency);
        break;
      case 'meeting':
        this.metricsCollector.recordMeeting(data.type, data.status);
        break;
      case 'dlq':
        if (data.added) {
          this.metricsCollector.recordDLQAdded(data.eventType, data.reason);
        }
        if (data.replayed) {
          this.metricsCollector.recordDLQReplayed(data.status);
        }
        break;
      case 'retry':
        this.metricsCollector.recordRetry(data.serviceId, data.attempt, data.result, data.delay);
        break;
      case 'health':
        this.metricsCollector.updateHealth(data.component, data.healthy);
        break;
      default:
        console.warn(`Unknown metric type: ${type}`);
    }
  }
  
  /**
   * 检查告警规则（手动触发）
   * @param {Object} context - 上下文数据
   */
  async checkAlerts(context) {
    return this.alertManager.checkAllRules(context);
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      metrics: this.metricsCollector.getOverview(),
      alerts: this.alertManager.getStats(),
    };
  }
  
  /**
   * 关闭所有模块
   */
  async close() {
    await this.alertManager.close();
    this.emit('closed');
  }
}

// ============================================
// Prometheus HTTP Handler（用于 metrics endpoint）
// ============================================

const createMetricsHandler = (observabilityLayer) => async (req, res) => {
  try {
    const metrics = await observabilityLayer.getMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.end(metrics);
  } catch (error) {
    res.status(500).end(`Error collecting metrics: ${error.message}`);
  }
};

// ============================================
// 导出
// ============================================

module.exports = {
  // 模块
  MetricsCollector,
  AlertManager,
  AlertNotifier,
  
  // 配置
  METRICS_CONFIG,
  ALERT_CONFIG,
  ALERT_RULES,
  SEVERITY_LEVELS,
  
  // 工厂函数
  createMetricsCollector,
  createAlertManager,
  
  // 组合器
  ObservabilityLayer,
  
  // 便捷创建
  createObservabilityLayer: (redisClient, config) => 
    new ObservabilityLayer(redisClient, config),
  
  // HTTP handler
  createMetricsHandler,
};