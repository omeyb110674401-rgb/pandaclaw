/**
 * PandaClaw 健康检查模块
 * 
 * 责责人: cppcc-1（DevOps专家）
 * 
 * 功能:
 * - Agent 心跳检测
 * - 服务状态上报
 * - 依赖健康检查
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

// ============================================
// 健康检查配置
// ============================================

const HEALTH_CONFIG = {
  heartbeatInterval: 30000,      // 心跳间隔 30秒
  heartbeatTimeout: 60000,       // 心跳超时 60秒
  checkInterval: 15000,          // 健康检查间隔 15秒
  maxMissedHeartbeats: 2,        // 最大丢失心跳数
};

// ============================================
// 健康检查器类
// ============================================

class HealthChecker extends EventEmitter {
  constructor(redisClient, config = {}) {
    super();
    this.redis = redisClient;
    this.config = { ...HEALTH_CONFIG, ...config };
    
    // 状态存储
    this.agents = new Map();        // Agent 心跳状态
    this.services = new Map();      // 服务健康状态
    this.dependencies = new Map();  // 依赖检查
    
    // 定时器
    this.checkTimer = null;
    this.heartbeatKey = 'pandaclaw:health:heartbeats';
    this.statusKey = 'pandaclaw:health:status';
    
    // 启动检查
    this.startChecking();
  }
  
  // ============================================
  // Agent 心跳检测
  // ============================================
  
  /**
   * 注册 Agent
   * @param {string} agentId - Agent ID
   * @param {Object} metadata - Agent 元数据
   */
  async registerAgent(agentId, metadata = {}) {
    const now = Date.now();
    const agentInfo = {
      agentId,
      registeredAt: now,
      lastHeartbeat: now,
      status: 'healthy',
      missedHeartbeats: 0,
      metadata: {
        role: metadata.role || 'unknown',
        expertise: metadata.expertise || 'unknown',
        sessionKey: metadata.sessionKey || null,
      },
    };
    
    this.agents.set(agentId, agentInfo);
    
    // 存储到 Redis
    await this.redis.hset(
      this.heartbeatKey,
      agentId,
      JSON.stringify(agentInfo)
    );
    
    this.emit('agentRegistered', agentInfo);
    
    return agentInfo;
  }
  
  /**
   * 接收心跳
   * @param {string} agentId - Agent ID
   * @param {Object} data - 心跳数据
   */
  async receiveHeartbeat(agentId, data = {}) {
    const now = Date.now();
    let agentInfo = this.agents.get(agentId) || await this.getAgent(agentId);
    
    if (!agentInfo) {
      // 未注册的 Agent，自动注册
      agentInfo = await this.registerAgent(agentId, data.metadata);
    }
    
    // 更新心跳
    agentInfo.lastHeartbeat = now;
    agentInfo.status = 'healthy';
    agentInfo.missedHeartbeats = 0;
    agentInfo.lastData = data;
    
    this.agents.set(agentId, agentInfo);
    
    // 存储到 Redis
    await this.redis.hset(
      this.heartbeatKey,
      agentId,
      JSON.stringify(agentInfo)
    );
    
    this.emit('heartbeatReceived', { agentId, timestamp: now });
    
    return agentInfo;
  }
  
  /**
   * 获取 Agent 信息
   * @param {string} agentId - Agent ID
   */
  async getAgent(agentId) {
    try {
      const data = await this.redis.hget(this.heartbeatKey, agentId);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return this.agents.get(agentId);
    }
  }
  
  /**
   * 检查 Agent 健康状态
   * @param {string} agentId - Agent ID
   */
  async checkAgentHealth(agentId) {
    const agentInfo = await this.getAgent(agentId);
    if (!agentInfo) {
      return { healthy: false, reason: 'not_registered' };
    }
    
    const now = Date.now();
    const elapsed = now - agentInfo.lastHeartbeat;
    
    if (elapsed > this.config.heartbeatTimeout) {
      // 心跳超时
      agentInfo.status = 'unhealthy';
      agentInfo.missedHeartbeats++;
      
      this.agents.set(agentId, agentInfo);
      await this.redis.hset(this.heartbeatKey, agentId, JSON.stringify(agentInfo));
      
      this.emit('agentUnhealthy', { agentId, missedHeartbeats: agentInfo.missedHeartbeats });
      
      return {
        healthy: false,
        reason: 'heartbeat_timeout',
        elapsed,
        missedHeartbeats: agentInfo.missedHeartbeats,
      };
    }
    
    return { healthy: true, elapsed };
  }
  
  /**
   * 获取所有 Agent 状态
   */
  async getAllAgents() {
    try {
      const all = await this.redis.hgetall(this.heartbeatKey);
      return Object.entries(all).map(([id, data]) => JSON.parse(data));
    } catch (error) {
      return Array.from(this.agents.values());
    }
  }
  
  /**
   * 移除 Agent
   * @param {string} agentId - Agent ID
   */
  async removeAgent(agentId) {
    this.agents.delete(agentId);
    await this.redis.hdel(this.heartbeatKey, agentId);
    this.emit('agentRemoved', { agentId });
  }
  
  // ============================================
  // 服务健康检查
  // ============================================
  
  /**
   * 注册服务
   * @param {string} serviceId - 服务 ID
   * @param {Function} checkFn - 健康检查函数
   */
  registerService(serviceId, checkFn) {
    this.services.set(serviceId, {
      serviceId,
      checkFn,
      status: 'unknown',
      lastCheck: null,
      lastError: null,
    });
    
    this.emit('serviceRegistered', { serviceId });
  }
  
  /**
   * 检查服务健康
   * @param {string} serviceId - 服务 ID
   */
  async checkService(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) {
      return { healthy: false, reason: 'not_registered' };
    }
    
    try {
      const result = await service.checkFn();
      
      service.status = result.healthy ? 'healthy' : 'unhealthy';
      service.lastCheck = Date.now();
      service.lastError = result.healthy ? null : result.reason;
      
      this.services.set(serviceId, service);
      
      if (!result.healthy) {
        this.emit('serviceUnhealthy', { serviceId, reason: result.reason });
      }
      
      return result;
    } catch (error) {
      service.status = 'error';
      service.lastCheck = Date.now();
      service.lastError = error.message;
      
      this.services.set(serviceId, service);
      
      this.emit('serviceError', { serviceId, error: error.message });
      
      return { healthy: false, reason: 'check_failed', error: error.message };
    }
  }
  
  /**
   * 获取服务状态
   * @param {string} serviceId - 服务 ID
   */
  getServiceStatus(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return null;
    
    return {
      serviceId,
      status: service.status,
      lastCheck: service.lastCheck,
      lastError: service.lastError,
    };
  }
  
  // ============================================
  // 依赖健康检查
  // ============================================
  
  /**
   * 注册依赖
   * @param {string} depId - 依赖 ID
   * @param {Object} config - 依赖配置
   */
  registerDependency(depId, config) {
    this.dependencies.set(depId, {
      depId,
      type: config.type,            // redis, database, api, etc.
      checkFn: config.checkFn,
      critical: config.critical || false,  // 关键依赖
      status: 'unknown',
      lastCheck: null,
    });
    
    this.emit('dependencyRegistered', { depId, type: config.type });
  }
  
  /**
   * 检查依赖
   * @param {string} depId - 依赖 ID
   */
  async checkDependency(depId) {
    const dep = this.dependencies.get(depId);
    if (!dep) {
      return { healthy: false, reason: 'not_registered' };
    }
    
    try {
      const result = await dep.checkFn();
      
      dep.status = result.healthy ? 'healthy' : 'unhealthy';
      dep.lastCheck = Date.now();
      
      this.dependencies.set(depId, dep);
      
      if (!result.healthy && dep.critical) {
        this.emit('criticalDependencyFailed', { depId, reason: result.reason });
      }
      
      return { ...result, critical: dep.critical };
    } catch (error) {
      dep.status = 'error';
      dep.lastCheck = Date.now();
      
      this.dependencies.set(depId, dep);
      
      return { healthy: false, reason: 'check_failed', error: error.message, critical: dep.critical };
    }
  }
  
  // ============================================
  // 综合健康检查
  // ============================================
  
  /**
   * 执行全面健康检查
   */
  async performFullCheck() {
    const now = Date.now();
    const report = {
      timestamp: now,
      healthy: true,
      summary: {
        agents: { total: 0, healthy: 0, unhealthy: 0 },
        services: { total: 0, healthy: 0, unhealthy: 0, error: 0 },
        dependencies: { total: 0, healthy: 0, unhealthy: 0, criticalFailed: 0 },
      },
      details: {
        agents: [],
        services: [],
        dependencies: [],
      },
    };
    
    // 检查所有 Agent
    const agents = await this.getAllAgents();
    for (const agent of agents) {
      const check = await this.checkAgentHealth(agent.agentId);
      report.details.agents.push({ ...agent, check });
      report.summary.agents.total++;
      if (check.healthy) {
        report.summary.agents.healthy++;
      } else {
        report.summary.agents.unhealthy++;
      }
    }
    
    // 检查所有服务
    for (const [serviceId, service] of this.services) {
      const check = await this.checkService(serviceId);
      report.details.services.push({ serviceId, ...check });
      report.summary.services.total++;
      if (check.healthy) {
        report.summary.services.healthy++;
      } else if (service.status === 'error') {
        report.summary.services.error++;
      } else {
        report.summary.services.unhealthy++;
      }
    }
    
    // 检查所有依赖
    for (const [depId, dep] of this.dependencies) {
      const check = await this.checkDependency(depId);
      report.details.dependencies.push({ depId, ...check });
      report.summary.dependencies.total++;
      if (check.healthy) {
        report.summary.dependencies.healthy++;
      } else {
        report.summary.dependencies.unhealthy++;
        if (check.critical) {
          report.summary.dependencies.criticalFailed++;
          report.healthy = false;
        }
      }
    }
    
    // 存储报告
    await this.redis.hset(
      this.statusKey,
      'lastReport',
      JSON.stringify(report)
    );
    
    this.emit('fullCheckCompleted', report);
    
    return report;
  }
  
  /**
   * 获取快速健康状态
   */
  async getQuickHealth() {
    try {
      const report = await this.redis.hget(this.statusKey, 'lastReport');
      return report ? JSON.parse(report) : null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 启动定期检查
   */
  startChecking() {
    if (this.checkTimer) return;
    
    this.checkTimer = setInterval(
      () => this.performFullCheck().catch(err => this.emit('error', err)),
      this.config.checkInterval
    );
    
    // 立即执行一次
    this.performFullCheck().catch(err => this.emit('error', err));
    
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
   * 关闭
   */
  async close() {
    this.stopChecking();
    this.emit('closed');
  }
}

// ============================================
// 预定义依赖检查器
// ============================================

const DependencyCheckers = {
  /**
   * Redis 检查器
   */
  redis: (redisClient) => async () => {
    try {
      await redisClient.ping();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  },
  
  /**
   * BullMQ 队列检查器
   */
  bullmq: (queue) => async () => {
    try {
      const isPaused = await queue.isPaused();
      return { healthy: !isPaused, paused: isPaused };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  },
  
  /**
   * HTTP 服务检查器
   */
  http: (url, timeout = 5000) => async () => {
    try {
      const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeout) });
      if (response.ok) {
        return { healthy: true, status: response.status };
      }
      return { healthy: false, reason: `HTTP ${response.status}` };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  },
};

// ============================================
// 导出
// ============================================

module.exports = {
  HealthChecker,
  HEALTH_CONFIG,
  DependencyCheckers,
  
  // 快捷工厂函数
  createHealthChecker: (redisClient, config) => new HealthChecker(redisClient, config),
};