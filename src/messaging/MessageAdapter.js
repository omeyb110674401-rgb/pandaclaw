/**
 * MessageAdapter - 消息适配器（符合契约 v1）
 * @author cppcc-2 (后端专家)
 * @version 2.0.0 - 契约合规版
 * @contract contracts/messages.ts
 * 
 * 功能：
 * - FastPath（进程内 <50ms）
 * - ReliablePath（BullMQ <200ms）
 * - 消息去重
 * - ACK确认机制
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/** 契约版本号 */
const CONTRACT_VERSION = 1;

// 从契约导入队列配置
const QUEUE_CONFIG = {
  QUEUES: {
    SEND_QUEUE: 'pandaclaw:send',
    RECEIVE_QUEUE: 'pandaclaw:receive',
    DEAD_LETTER_QUEUE: 'pandaclaw:dead-letter',
  },
  REDIS: {
    host: 'localhost',
    port: 6379,
    db: 0,
  },
  MESSAGE_TTL: 24 * 60 * 60 * 1000,
  RETRY: {
    maxRetries: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
};

// 延迟导入 BullMQ
let Queue, Worker;
try {
  const bullmq = require('bullmq');
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
} catch (e) {
  console.warn('⚠️ BullMQ 未安装，ReliablePath 将降级');
}

/**
 * 消息适配器（符合 MessageAdapter 接口）
 */
class MessageAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      ...QUEUE_CONFIG,
      ...options,
      redis: { ...QUEUE_CONFIG.REDIS, ...options.redis }
    };
    
    this.fastPath = null;
    this.reliablePath = null;
    this.dedupCache = new Map();
    this.handlers = new Map();
    this.pendingAcks = new Map();
    
    this.stats = {
      fastPathCount: 0,
      reliablePathCount: 0,
      dedupCount: 0,
      ackCount: 0,
      errorCount: 0,
      messagesProcessed: 0,
      totalLatency: 0
    };
    
    this._initialize();
  }
  
  _initialize() {
    // FastPath (EventEmitter)
    this.fastPath = new FastPathChannel();
    this._setupFastPathHandlers();
    
    // ReliablePath (BullMQ)
    if (Queue && this.config.enableReliable !== false) {
      this._initializeReliablePath();
    }
    
    console.log('✅ MessageAdapter 初始化完成 (契约 v1)');
    console.log(`   FastPath: 已启用`);
    console.log(`   ReliablePath: ${this.reliablePath ? '已启用' : '降级模式'}`);
  }
  
  _setupFastPathHandlers() {
    this.fastPath.on('message', (message) => {
      this._handleMessage('fast', message);
    });
  }
  
  _initializeReliablePath() {
    try {
      this.reliablePath = new ReliablePathChannel(this.config);
      
      this.reliablePath.on('message', (message) => {
        this._handleMessage('reliable', message);
      });
      
      this.reliablePath.on('error', (error) => {
        this.stats.errorCount++;
        this.emit('error', { type: 'reliable', error });
      });
    } catch (e) {
      console.warn('⚠️ ReliablePath 初始化失败:', e.message);
      this.reliablePath = null;
    }
  }
  
  // ==================== MessageAdapter 接口实现 ====================
  
  /**
   * 发送消息（符合 MessageAdapter.send）
   * @param {QueuedMessage} message 消息对象
   * @returns {Promise<string>} 消息ID
   */
  async send(message) {
    const messageId = message.id || uuidv4();
    const correlationId = message.correlationId || uuidv4();
    const now = Date.now();
    
    const enrichedMessage = {
      id: messageId,
      version: CONTRACT_VERSION,
      correlationId,
      meetingId: message.meetingId,
      from: message.from,
      to: message.to,
      type: message.type,
      priority: message.priority || 'normal',
      payload: message.payload,
      metadata: {
        step: message.metadata?.step || 0,
        requiresResponse: message.metadata?.requiresResponse || false,
        timeout: message.metadata?.timeout || 60000,
        retryCount: message.metadata?.retryCount || 0
      },
      createdAt: now,
      expiresAt: now + this.config.MESSAGE_TTL
    };
    
    // 去重检查
    if (this._isDuplicate(messageId)) {
      this.stats.dedupCount++;
      return messageId;
    }
    
    this._recordMessage(messageId);
    
    const channel = this._selectChannel(message.priority);
    const startTime = Date.now();
    
    try {
      await channel.send(enrichedMessage);
      
      // 更新统计
      const latency = Date.now() - startTime;
      this.stats.totalLatency += latency;
      this.stats.messagesProcessed++;
      
      if (channel === this.fastPath) {
        this.stats.fastPathCount++;
      } else {
        this.stats.reliablePathCount++;
      }
      
      return messageId;
    } catch (error) {
      this.stats.errorCount++;
      this.emit('error', { type: 'send', message: enrichedMessage, error });
      throw error;
    }
  }
  
  /**
   * 广播消息（符合 MessageAdapter.broadcast）
   * @param {string} meetingId 会议ID
   * @param {Omit<QueuedMessage, 'to'>} message 消息对象
   * @returns {Promise<string>} 消息ID
   */
  async broadcast(meetingId, message) {
    return this.send({
      ...message,
      meetingId,
      to: 'all'
    });
  }
  
  /**
   * 等待响应（符合 MessageAdapter.waitForResponse）
   * @param {string} correlationId 关联ID
   * @param {number} timeout 超时时间（毫秒）
   * @returns {Promise<ResponseMessage>} 响应消息
   */
  async waitForResponse(correlationId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handlers.delete(correlationId);
        reject(new Error(`响应超时: ${correlationId}`));
      }, timeout);
      
      this.handlers.set(correlationId, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }
  
  /**
   * 订阅消息（符合 MessageAdapter.subscribe）
   * @param {string} agentId Agent ID
   * @param {Function} handler 处理函数
   */
  subscribe(agentId, handler) {
    const wrapper = async (message) => {
      if (message.to === agentId || message.to === 'all') {
        await handler(message);
      }
    };
    
    this.on('message', wrapper);
    return () => this.off('message', wrapper);
  }
  
  /**
   * 确认消息（符合 MessageAdapter.ack）
   * @param {string} messageId 消息ID
   */
  async ack(messageId) {
    this.stats.ackCount++;
    this.pendingAcks.delete(messageId);
    
    // 如果使用 ReliablePath，确认消息
    if (this.reliablePath && this.reliablePath.ack) {
      await this.reliablePath.ack(messageId);
    }
  }
  
  // ==================== 内部方法 ====================
  
  _handleMessage(channelType, message) {
    if (this._isDuplicate(message.id)) {
      this.stats.dedupCount++;
      return;
    }
    
    this._recordMessage(message.id);
    this.pendingAcks.set(message.id, message);
    
    // 检查是否有等待的处理器
    const handler = this.handlers.get(message.correlationId);
    if (handler) {
      const response = {
        id: uuidv4(),
        correlationId: message.correlationId,
        status: 'success',
        payload: message.payload,
        from: message.from,
        respondedAt: Date.now()
      };
      handler(response);
      this.handlers.delete(message.correlationId);
      return;
    }
    
    this.emit('message', { channel: channelType, message });
  }
  
  _selectChannel(priority) {
    if (priority === 'high' && this.reliablePath) {
      return this.reliablePath;
    }
    return this.fastPath;
  }
  
  _isDuplicate(messageId) {
    return this.dedupCache.has(messageId);
  }
  
  _recordMessage(messageId) {
    this.dedupCache.set(messageId, Date.now());
    
    // 清理过期缓存
    const now = Date.now();
    for (const [id, timestamp] of this.dedupCache.entries()) {
      if (now - timestamp > 60000) {
        this.dedupCache.delete(id);
      }
    }
  }
  
  /**
   * 获取统计信息（符合 HealthCheckResponse.metrics）
   */
  getStats() {
    const avgLatency = this.stats.messagesProcessed > 0
      ? Math.round(this.stats.totalLatency / this.stats.messagesProcessed)
      : 0;
    
    return {
      messagesProcessed: this.stats.messagesProcessed,
      averageLatency: avgLatency,
      errorRate: this.stats.messagesProcessed > 0
        ? Math.round((this.stats.errorCount / this.stats.messagesProcessed) * 100)
        : 0,
      // 额外统计
      fastPathCount: this.stats.fastPathCount,
      reliablePathCount: this.stats.reliablePathCount,
      dedupCount: this.stats.dedupCount,
      ackCount: this.stats.ackCount
    };
  }
  
  async close() {
    if (this.fastPath) await this.fastPath.close();
    if (this.reliablePath) await this.reliablePath.close();
    this.dedupCache.clear();
    this.handlers.clear();
    this.pendingAcks.clear();
  }
}

/**
 * FastPath 通道（进程内）
 */
class FastPathChannel extends EventEmitter {
  constructor() {
    super();
    this.name = 'fast';
  }
  
  async send(message) {
    setImmediate(() => this.emit('message', message));
    return { delivered: true };
  }
  
  async close() {
    this.removeAllListeners();
  }
}

/**
 * ReliablePath 通道（BullMQ）
 */
class ReliablePathChannel extends EventEmitter {
  constructor(config) {
    super();
    this.name = 'reliable';
    this.config = config;
    this.queue = null;
    this.worker = null;
    
    if (Queue) {
      this._initialize();
    }
  }
  
  _initialize() {
    this.queue = new Queue(QUEUE_CONFIG.QUEUES.SEND_QUEUE, {
      connection: this.config.redis
    });
    
    if (Worker) {
      this.worker = new Worker(
        QUEUE_CONFIG.QUEUES.RECEIVE_QUEUE,
        async (job) => {
          this.emit('message', job.data);
          return { processed: true };
        },
        { connection: this.config.redis }
      );
    }
  }
  
  async send(message) {
    if (!this.queue) {
      throw new Error('ReliablePath 未初始化');
    }
    
    const job = await this.queue.add('message', message, {
      attempts: QUEUE_CONFIG.RETRY.maxRetries,
      backoff: QUEUE_CONFIG.RETRY.backoff
    });
    
    return { jobId: job.id, delivered: true };
  }
  
  async ack(messageId) {
    // BullMQ 自动确认
  }
  
  async close() {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    this.removeAllListeners();
  }
}

module.exports = {
  MessageAdapter,
  FastPathChannel,
  ReliablePathChannel,
  QUEUE_CONFIG,
  CONTRACT_VERSION
};