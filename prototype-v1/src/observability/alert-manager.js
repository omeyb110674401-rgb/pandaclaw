/**
 * PandaClaw 告警管理模块
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 
 * 功能:
 * - 告警规则定义
 * - 告警触发与抑制
 * - 告警通知
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

// ============================================
// 告警配置
// ============================================

const ALERT_CONFIG = {
  checkInterval: 30000,          // 检查间隔 30秒
  cooldownPeriod: 60000,         // 冷却期 60秒（防止重复告警）
  maxActiveAlerts: 100,          // 最大活跃告警数
  retentionDays: 7,              // 历史告警保留天数
};

// ============================================
// 告警规则定义
// ============================================

const ALERT_RULES = {
  // 熔断器告警
  circuitBreakerOpen: {
    id: 'circuit-breaker-open',
    name: '熔断器打开',
    severity: 'critical',
    description: '服务熔断器已打开，请求被拒绝',
    condition: (metrics) => metrics.circuitBreakerState === 'open',
    labels: ['service_id'],
    message: '服务 {service_id} 熔断器已打开，失败率超过阈值',
  },
  
  circuitBreakerHalfOpen: {
    id: 'circuit-breaker-half-open',
    name: '熔断器半开',
    severity: 'warning',
    description: '熔断器正在试探恢复',
    condition: (metrics) => metrics.circuitBreakerState === 'half-open',
    labels: ['service_id'],
    message: '服务 {service_id} 熔断器进入半开状态',
  },
  
  // Agent 心跳告警
  agentHeartbeatTimeout: {
    id: 'agent-heartbeat-timeout',
    name: 'Agent 心跳超时',
    severity: 'critical',
    description: 'Agent 心跳丢失超过阈值',
    condition: (metrics) => metrics.missedHeartbeats >= 2,
    labels: ['agent_id'],
    message: 'Agent {agent_id} 心跳丢失 {missedHeartbeats} 次',
  },
  
  agentUnhealthy: {
    id: 'agent-unhealthy',
    name: 'Agent 不健康',
    severity: 'warning',
    description: 'Agent 状态标记为不健康',
    condition: (metrics) => metrics.agentStatus === 'unhealthy',
    labels: ['agent_id'],
    message: 'Agent {agent_id} 处于不健康状态',
  },
  
  // 队列告警
  queueBacklogHigh: {
    id: 'queue-backlog-high',
    name: '队列积压过高',
    severity: 'warning',
    description: '消息队列积压超过阈值',
    condition: (metrics) => metrics.queueSize > 100,
    labels: ['queue_name'],
    threshold: 100,
    message: '队列 {queue_name} 积压 {queueSize} 条消息',
  },
  
  queueBacklogCritical: {
    id: 'queue-backlog-critical',
    name: '队列积压严重',
    severity: 'critical',
    description: '消息队列积压严重，可能影响系统运行',
    condition: (metrics) => metrics.queueSize > 500,
    labels: ['queue_name'],
    threshold: 500,
    message: '队列 {queue_name} 积压严重 {queueSize} 条消息',
  },
  
  // 死信队列告警
  dlqHigh: {
    id: 'dlq-high',
    name: '死信队列过高',
    severity: 'warning',
    description: '死信队列条目超过阈值',
    condition: (metrics) => metrics.dlqSize > 50,
    labels: [],
    threshold: 50,
    message: '死信队列有 {dlqSize} 条待处理消息',
  },
  
  dlqCritical: {
    id: 'dlq-critical',
    name: '死信队列严重',
    severity: 'critical',
    description: '死信队列条目严重，需要人工介入',
    condition: (metrics) => metrics.dlqSize > 200,
    labels: [],
    threshold: 200,
    message: '死信队列严重 {dlqSize} 条，需人工检查',
  },
  
  // 依赖告警
  dependencyFailed: {
    id: 'dependency-failed',
    name: '依赖服务失败',
    severity: 'critical',
    description: '关键依赖服务不可用',
    condition: (metrics) => metrics.dependencyHealthy === false && metrics.dependencyCritical === true,
    labels: ['dependency_id'],
    message: '关键依赖 {dependency_id} 不可用',
  },
  
  // 消息延迟告警
  messageLatencyHigh: {
    id: 'message-latency-high',
    name: '消息延迟过高',
    severity: 'warning',
    description: '消息处理延迟超过阈值',
    condition: (metrics) => metrics.messageLatency > 5000,
    labels: ['message_type'],
    threshold: 5000,
    message: '消息类型 {message_type} 平均延迟 {messageLatency} ms',
  },
  
  // 系统健康告警
  systemUnhealthy: {
    id: 'system-unhealthy',
    name: '系统不健康',
    severity: 'critical',
    description: '系统整体健康检查失败',
    condition: (metrics) => metrics.systemHealth === false,
    labels: [],
    message: '系统健康检查失败，多个组件异常',
  },
  
  // 会议异常告警
  meetingTimeout: {
    id: 'meeting-timeout',
    name: '会议超时',
    severity: 'warning',
    description: '会议运行时间超过预期',
    condition: (metrics) => metrics.meetingDuration > 3600000,  // 1小时
    labels: ['meeting_id'],
    threshold: 3600000,
    message: '会议 {meeting_id} 已运行超过 1 小时',
  },
};

// ============================================
// 告警级别
// ============================================

const SEVERITY_LEVELS = {
  info: 0,
  warning: 1,
  critical: 2,
};

// ============================================
// 告警管理器类
// ============================================

class AlertManager extends EventEmitter {
  constructor(redisClient, metricsCollector, config = {}) {
    super();
    this.redis = redisClient;
    this.metrics = metricsCollector;
    this.config = { ...ALERT_CONFIG, ...config };
    
    // 告警状态
    this.activeAlerts = new Map();     // 活跃告警
    this.lastTriggered = new Map();    // 最后触发时间（用于冷却）
    this.alertHistory = [];            // 告警历史
    
    // 存储键
    this.activeKey = 'pandaclaw:alerts:active';
    this.historyKey = 'pandaclaw:alerts:history';
    
    // 定时器
    this.checkTimer = null;
    
    // 启动检查
    this.startChecking();
  }
  
  /**
   * 检查所有告警规则
   */
  async checkAllRules(context = {}) {
    const triggeredAlerts = [];
    
    for (const [ruleId, rule] of Object.entries(ALERT_RULES)) {
      // 检查冷却期
      if (this.isInCooldown(ruleId)) {
        continue;
      }
      
      // 获取相关指标
      const metrics = await this.getMetricsForRule(ruleId, context);
      
      // 评估条件
      if (rule.condition(metrics)) {
        const alert = await this.triggerAlert(rule, metrics);
        triggeredAlerts.push(alert);
      }
    }
    
    return triggeredAlerts;
  }
  
  /**
   * 触发告警
   * @param {Object} rule - 告警规则
   * @param {Object} metrics - 相关指标
   */
  async triggerAlert(rule, metrics) {
    const alertId = uuidv4();
    const now = Date.now();
    
    // 构建告警消息
    let message = rule.message;
    for (const label of rule.labels) {
      message = message.replace(`{${label}}`, metrics[label] || 'unknown');
    }
    // 替换其他变量
    for (const [key, value] of Object.entries(metrics)) {
      message = message.replace(`{${key}}`, value);
    }
    
    const alert = {
      id: alertId,
      ruleId: rule.id,
      name: rule.name,
      severity: rule.severity,
      message,
      description: rule.description,
      labels: rule.labels.reduce((acc, label) => {
        acc[label] = metrics[label];
        return acc;
      }, {}),
      metrics,
      triggeredAt: now,
      status: 'firing',
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
    };
    
    // 存储活跃告警
    this.activeAlerts.set(alertId, alert);
    this.lastTriggered.set(rule.id, now);
    
    await this.redis.hset(this.activeKey, alertId, JSON.stringify(alert));
    
    // 发出事件
    this.emit('alertTriggered', alert);
    
    // 检查最大告警数
    if (this.activeAlerts.size > this.config.maxActiveAlerts) {
      await this.trimAlerts();
    }
    
    return alert;
  }
  
  /**
   * 确认告警
   * @param {string} alertId - 告警 ID
   * @param {string} acknowledgedBy - 确认人
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }
    
    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();
    
    this.activeAlerts.set(alertId, alert);
    await this.redis.hset(this.activeKey, alertId, JSON.stringify(alert));
    
    this.emit('alertAcknowledged', alert);
    
    return alert;
  }
  
  /**
   * 解决告警
   * @param {string} alertId - 告警 ID
   * @param {string} resolvedBy - 解决人
   */
  async resolveAlert(alertId, resolvedBy = 'system') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }
    
    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolvedBy = resolvedBy;
    
    // 从活跃告警移除
    this.activeAlerts.delete(alertId);
    await this.redis.hdel(this.activeKey, alertId);
    
    // 添加到历史
    this.alertHistory.push(alert);
    await this.redis.rpush(this.historyKey, JSON.stringify(alert));
    
    this.emit('alertResolved', alert);
    
    return alert;
  }
  
  /**
   * 获取活跃告警
   * @param {Object} filter - 筛选条件
   */
  async getActiveAlerts(filter = {}) {
    let alerts = Array.from(this.activeAlerts.values());
    
    if (filter.severity) {
      alerts = alerts.filter(a => a.severity === filter.severity);
    }
    if (filter.ruleId) {
      alerts = alerts.filter(a => a.ruleId === filter.ruleId);
    }
    if (filter.acknowledged !== undefined) {
      alerts = alerts.filter(a => a.acknowledged === filter.acknowledged);
    }
    
    // 按严重程度和时间排序
    alerts.sort((a, b) => {
      const severityDiff = SEVERITY_LEVELS[b.severity] - SEVERITY_LEVELS[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.triggeredAt - a.triggeredAt;
    });
    
    return alerts;
  }
  
  /**
   * 获取告警历史
   * @param {number} limit - 数量限制
   */
  async getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }
  
  /**
   * 检查冷却期
   * @param {string} ruleId - 规则 ID
   */
  isInCooldown(ruleId) {
    const lastTrigger = this.lastTriggered.get(ruleId);
    if (!lastTrigger) return false;
    
    return Date.now() - lastTrigger < this.config.cooldownPeriod;
  }
  
  /**
   * 获取规则相关指标
   * @param {string} ruleId - 规则 ID
   * @param {Object} context - 上下文
   */
  async getMetricsForRule(ruleId, context) {
    // 合成指标数据
    // 实际使用时需要从 metricsCollector 或 healthChecker 获取
    return {
      ...context,
      circuitBreakerState: context.circuitBreakerState || 'closed',
      missedHeartbeats: context.missedHeartbeats || 0,
      agentStatus: context.agentStatus || 'healthy',
      queueSize: context.queueSize || 0,
      dlqSize: context.dlqSize || 0,
      dependencyHealthy: context.dependencyHealthy !== false,
      dependencyCritical: context.dependencyCritical || false,
      messageLatency: context.messageLatency || 0,
      systemHealth: context.systemHealth !== false,
      meetingDuration: context.meetingDuration || 0,
    };
  }
  
  /**
   * 修剪告警（超过最大数量时）
   */
  async trimAlerts() {
    // 按严重程度排序，保留严重告警，移除低严重度的旧告警
    const alerts = await this.getActiveAlerts();
    const toRemove = alerts
      .filter(a => a.severity === 'info' || a.severity === 'warning')
      .sort((a, b) => a.triggeredAt - b.triggeredAt)
      .slice(0, this.activeAlerts.size - this.config.maxActiveAlerts);
    
    for (const alert of toRemove) {
      await this.resolveAlert(alert.id, 'auto_trim');
    }
    
    this.emit('alertsTrimmed', { removed: toRemove.length });
  }
  
  /**
   * 启动定期检查
   */
  startChecking() {
    if (this.checkTimer) return;
    
    this.checkTimer = setInterval(
      async () => {
        try {
          // 从 metricsCollector 获取概览数据
          const overview = this.metrics?.getOverview();
          
          // 检查告警规则（需要传入实际指标数据）
          const alerts = await this.checkAllRules();
          
          if (alerts.length > 0) {
            this.emit('alertsChecked', { count: alerts.length, alerts });
          }
        } catch (error) {
          this.emit('error', error);
        }
      },
      this.config.checkInterval
    );
    
    this.emit('checkingStarted', { interval: this.config.checkInterval });
  }
  
  /**
   * 停止定期检查
   */
  stopChecking() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.emit('checkingStopped');
    }
  }
  
  /**
   * 获取告警统计
   */
  getStats() {
    const active = Array.from(this.activeAlerts.values());
    
    return {
      active: active.length,
      bySeverity: {
        info: active.filter(a => a.severity === 'info').length,
        warning: active.filter(a => a.severity === 'warning').length,
        critical: active.filter(a => a.severity === 'critical').length,
      },
      acknowledged: active.filter(a => a.acknowledged).length,
      unacknowledged: active.filter(a => !a.acknowledged).length,
      history: this.alertHistory.length,
      rules: Object.keys(ALERT_RULES).length,
    };
  }
  
  /**
   * 关闭
   */
  async close() {
    this.stopChecking();
    this.emit('closed');
  }
}

// ============================================
// 告警通知器（可扩展）
// ============================================

class AlertNotifier {
  constructor(alertManager) {
    this.alertManager = alertManager;
    this.channels = new Map();
    
    // 监听告警事件
    this.alertManager.on('alertTriggered', (alert) => {
      this.notifyAll(alert);
    });
  }
  
  /**
   * 注册通知通道
   * @param {string} channel - 通道名
   * @param {Function} handler - 处理函数
   */
  registerChannel(channel, handler) {
    this.channels.set(channel, handler);
  }
  
  /**
   * 通知所有通道
   * @param {Object} alert - 告警
   */
  async notifyAll(alert) {
    for (const [channel, handler] of this.channels) {
      try {
        await handler(alert);
      } catch (error) {
        console.error(`Alert notification failed for ${channel}:`, error.message);
      }
    }
  }
  
  /**
   * 格式化告警消息
   */
  formatAlert(alert) {
    const severityEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🔴',
    };
    
    return {
      title: `${severityEmoji[alert.severity]} ${alert.name}`,
      message: alert.message,
      severity: alert.severity,
      labels: alert.labels,
      triggeredAt: new Date(alert.triggeredAt).toISOString(),
      id: alert.id,
    };
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  AlertManager,
  AlertNotifier,
  ALERT_CONFIG,
  ALERT_RULES,
  SEVERITY_LEVELS,
  
  // 快捷工厂函数
  createAlertManager: (redisClient, metricsCollector, config) => 
    new AlertManager(redisClient, metricsCollector, config),
};