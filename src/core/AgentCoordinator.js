/**
 * AgentCoordinator - Agent 协调器
 * @author cppcc-2 (后端专家)
 * @version 1.0.0
 * 
 * 功能：
 * - Agent 响应收集
 * - 同步屏障
 * - 超时处理
 * - 响应验证
 * 
 * 验收标准：
 * - 10+ Agent 并发无阻塞
 * - 响应收集率 100%
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class AgentCoordinator extends EventEmitter {
  /**
   * 创建协调器
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      defaultTimeout: options.defaultTimeout || 60000, // 默认超时 60s
      pollInterval: options.pollInterval || 5000,      // 轮询间隔 5s
      maxRetries: options.maxRetries || 2,             // 最大重试次数
      ...options
    };
    
    // 响应收集器
    this.collectors = new Map();
    
    // Agent 状态映射
    this.agentStatus = new Map();
    
    // 统计信息
    this.stats = {
      totalCollections: 0,
      successfulCollections: 0,
      timeoutCollections: 0,
      totalResponses: 0
    };
  }
  
  // ==================== 响应收集 ====================
  
  /**
   * 开始收集响应
   * @param {Object} config 收集配置
   */
  startCollection(config) {
    const collectionId = config.id || uuidv4();
    
    const collector = {
      id: collectionId,
      meetingId: config.meetingId,
      stage: config.stage,
      expectedAgents: config.expectedAgents || [],
      responses: new Map(),
      timeout: config.timeout || this.options.defaultTimeout,
      startedAt: Date.now(),
      status: 'collecting',
      retryCount: 0
    };
    
    this.collectors.set(collectionId, collector);
    this.stats.totalCollections++;
    
    // 设置超时检查
    this._setupTimeoutCheck(collectionId);
    
    return {
      collectionId,
      expectedAgents: collector.expectedAgents,
      timeout: collector.timeout
    };
  }
  
  /**
   * 记录响应
   * @param {string} collectionId 收集器 ID
   * @param {string} agentId Agent ID
   * @param {Object} response 响应内容
   */
  recordResponse(collectionId, agentId, response) {
    const collector = this.collectors.get(collectionId);
    
    if (!collector) {
      console.warn(`收集器不存在: ${collectionId}`);
      return { success: false, reason: 'collector_not_found' };
    }
    
    if (collector.status !== 'collecting') {
      return { success: false, reason: 'collector_closed' };
    }
    
    // 记录响应
    collector.responses.set(agentId, {
      ...response,
      respondedAt: Date.now()
    });
    
    this.stats.totalResponses++;
    
    // 检查是否完成
    const result = this.checkCompletion(collectionId);
    
    if (result.complete) {
      this._completeCollection(collectionId, result);
    }
    
    return {
      success: true,
      collectionId,
      agentId,
      ...result
    };
  }
  
  /**
   * 检查完成状态
   * @param {string} collectionId 收集器 ID
   */
  checkCompletion(collectionId) {
    const collector = this.collectors.get(collectionId);
    
    if (!collector) {
      return { complete: false, reason: 'collector_not_found' };
    }
    
    const expectedCount = collector.expectedAgents.length;
    const respondedCount = collector.responses.size;
    const missingAgents = collector.expectedAgents.filter(id => !collector.responses.has(id));
    
    return {
      complete: respondedCount >= expectedCount,
      respondedCount,
      expectedCount,
      responseRate: expectedCount > 0 ? respondedCount / expectedCount : 0,
      missingAgents,
      respondedAgents: Array.from(collector.responses.keys())
    };
  }
  
  /**
   * 等待收集完成（同步屏障）
   * @param {string} collectionId 收集器 ID
   * @param {number} timeout 超时时间
   */
  async waitForCompletion(collectionId, timeout = null) {
    const collector = this.collectors.get(collectionId);
    
    if (!collector) {
      throw new Error(`收集器不存在: ${collectionId}`);
    }
    
    const actualTimeout = timeout || collector.timeout;
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkComplete = () => {
        const result = this.checkCompletion(collectionId);
        
        if (result.complete) {
          this.stats.successfulCollections++;
          resolve({ ...result, timedOut: false });
          return;
        }
        
        if (Date.now() - startTime > actualTimeout) {
          this.stats.timeoutCollections++;
          collector.status = 'timeout';
          resolve({ ...result, timedOut: true });
          return;
        }
        
        // 继续轮询
        setTimeout(checkComplete, this.options.pollInterval);
      };
      
      checkComplete();
    });
  }
  
  /**
   * 获取收集结果
   * @param {string} collectionId 收集器 ID
   */
  getResults(collectionId) {
    const collector = this.collectors.get(collectionId);
    
    if (!collector) {
      return null;
    }
    
    return {
      id: collectionId,
      meetingId: collector.meetingId,
      stage: collector.stage,
      status: collector.status,
      responses: Object.fromEntries(collector.responses),
      expectedAgents: collector.expectedAgents,
      respondedAgents: Array.from(collector.responses.keys()),
      missingAgents: collector.expectedAgents.filter(id => !collector.responses.has(id)),
      duration: Date.now() - collector.startedAt,
      startedAt: collector.startedAt
    };
  }
  
  /**
   * 取消收集
   * @param {string} collectionId 收集器 ID
   */
  cancelCollection(collectionId) {
    const collector = this.collectors.get(collectionId);
    
    if (collector) {
      collector.status = 'cancelled';
      this.collectors.delete(collectionId);
    }
  }
  
  // ==================== Agent 状态管理 ====================
  
  /**
   * 注册 Agent
   * @param {string} agentId Agent ID
   * @param {Object} info Agent 信息
   */
  registerAgent(agentId, info = {}) {
    this.agentStatus.set(agentId, {
      id: agentId,
      status: 'ready',
      lastActive: Date.now(),
      currentCollection: null,
      ...info
    });
    
    return this.agentStatus.get(agentId);
  }
  
  /**
   * 更新 Agent 状态
   * @param {string} agentId Agent ID
   * @param {string} status 状态
   */
  updateAgentStatus(agentId, status) {
    const agent = this.agentStatus.get(agentId);
    
    if (agent) {
      agent.status = status;
      agent.lastActive = Date.now();
    }
    
    return agent;
  }
  
  /**
   * 获取活跃 Agent 列表
   * @param {number} threshold 阈值（毫秒）
   */
  getActiveAgents(threshold = 120000) {
    const now = Date.now();
    const activeAgents = [];
    
    for (const [id, agent] of this.agentStatus.entries()) {
      if (now - agent.lastActive < threshold) {
        activeAgents.push(id);
      }
    }
    
    return activeAgents;
  }
  
  // ==================== 超时处理 ====================
  
  /**
   * 设置超时检查
   */
  _setupTimeoutCheck(collectionId) {
    const collector = this.collectors.get(collectionId);
    if (!collector) return;
    
    setTimeout(() => {
      const current = this.collectors.get(collectionId);
      if (current && current.status === 'collecting') {
        this._handleTimeout(collectionId);
      }
    }, collector.timeout);
  }
  
  /**
   * 处理超时
   */
  _handleTimeout(collectionId) {
    const collector = this.collectors.get(collectionId);
    
    if (!collector) return;
    
    const result = this.checkCompletion(collectionId);
    
    this.emit('timeout', {
      collectionId,
      meetingId: collector.meetingId,
      stage: collector.stage,
      missingAgents: result.missingAgents
    });
    
    // 检查是否需要重试
    if (collector.retryCount < this.options.maxRetries && result.missingAgents.length > 0) {
      this._retryCollection(collectionId, result.missingAgents);
    } else {
      this.stats.timeoutCollections++;
      collector.status = 'timeout';
      this._completeCollection(collectionId, result);
    }
  }
  
  /**
   * 重试收集
   */
  _retryCollection(collectionId, missingAgents) {
    const collector = this.collectors.get(collectionId);
    
    if (!collector) return;
    
    collector.retryCount++;
    
    this.emit('retry', {
      collectionId,
      meetingId: collector.meetingId,
      stage: collector.stage,
      missingAgents,
      retryCount: collector.retryCount
    });
  }
  
  /**
   * 完成收集
   */
  _completeCollection(collectionId, result) {
    const collector = this.collectors.get(collectionId);
    
    if (collector) {
      collector.status = 'completed';
      
      this.emit('complete', {
        collectionId,
        meetingId: collector.meetingId,
        stage: collector.stage,
        result
      });
    }
  }
  
  // ==================== 统计 ====================
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeCollections: this.collectors.size,
      registeredAgents: this.agentStatus.size,
      successRate: this.stats.totalCollections > 0 
        ? this.stats.successfulCollections / this.stats.totalCollections 
        : 0
    };
  }
  
  /**
   * 清理过期收集器
   * @param {number} maxAge 最大存活时间（毫秒）
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    
    for (const [id, collector] of this.collectors.entries()) {
      if (now - collector.startedAt > maxAge) {
        this.collectors.delete(id);
      }
    }
  }
}

module.exports = { AgentCoordinator };