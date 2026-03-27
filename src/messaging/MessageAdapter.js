/**
 * MessageAdapter - 消息适配器
 * @author cppcc-2 (后端专家)
 * @version 1.0.0
 * 
 * 功能：
 * - 统一消息接口
 * - FastPath（进程内 <50ms）
 * - ReliablePath（BullMQ <200ms）
 * - 消息去重
 * - 版本路由
 * 
 * 验收标准：
 * - Fast Path 延迟 < 50ms
 * - Reliable Path 延迟 < 200ms
 * - 消息可靠性：零丢失、零重复
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

// 延迟导入 BullMQ（可选依赖）
let Queue, FlowProducer;
try {
  const bullmq = require('bullmq');
  Queue = bullmq.Queue;
  FlowProducer = bullmq.FlowProducer;
} catch (e) {
  console.warn('⚠️ BullMQ 未安装，ReliablePath 将降级为 FastPath');
}

/**
 * 消息适配器类
 */
class MessageAdapter extends EventEmitter {
  /**
   * 创建消息适配器
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      fastPathEnabled: true,
      reliablePathEnabled: !!Queue,
      redisHost: options.redisHost || 'localhost',
      redisPort: options.redisPort || 6379,
      dedupTTL: options.dedupTTL || 60000, // 去重缓存 TTL
      ...options
    };
    
    // 消息通道
    this.fastPath = null;
    this.reliablePath = null;
    
    // 去重缓存
    this.dedupCache = new Map();
    
    // 消息处理器映射
    this.handlers = new Map();
    
    // 统计信息
    this.stats = {
      fastPathCount: 0,
      reliablePathCount: 0,
      dedupCount: 0,
      errorCount: 0
    };
    
    // 初始化
    this._initialize();
  }
  
  /**
   * 初始化消息通道
   */
  _initialize() {
    // 初始化 FastPath（EventEmitter）
    this.fastPath = new FastPathChannel();
    this._setupFastPathHandlers();
    
    // 初始化 ReliablePath（BullMQ）
    if (this.options.reliablePathEnabled && Queue) {
      this._initializeReliablePath();
    }
    
    console.log('✅ MessageAdapter 初始化完成');
    console.log(`   FastPath: 已启用`);
    console.log(`   ReliablePath: ${this.options.reliablePathEnabled ? '已启用' : '未启用（降级模式）'}`);
  }
  
  /**
   * 设置 FastPath 事件处理器
   */
  _setupFastPathHandlers() {
    this.fastPath.on('message', (message) => {
      this._handleMessage('fast', message);
    });
    
    this.fastPath.on('error', (error) => {
      this.stats.errorCount++;
      this.emit('error', { type: 'fast', error });
    });
  }
  
  /**
   * 初始化 ReliablePath
   */
  _initializeReliablePath() {
    try {
      const connection = {
        host: this.options.redisHost,
        port: this.options.redisPort
      };
      
      this.reliablePath = new ReliablePathChannel(connection);
      
      this.reliablePath.on('message', (message) => {
        this._handleMessage('reliable', message);
      });
      
      this.reliablePath.on('error', (error) => {
        this.stats.errorCount++;
        this.emit('error', { type: 'reliable', error });
      });
    } catch (e) {
      console.warn('⚠️ ReliablePath 初始化失败，降级为 FastPath');
      this.options.reliablePathEnabled = false;
    }
  }
  
  // ==================== 消息发送 ====================
  
  /**
   * 发送消息
   * @param {Object} message 消息对象
   * @param {Object} options 发送选项
   */
  async send(message, options = {}) {
    // 生成消息 ID
    const messageId = message.messageId || uuidv4();
    const enrichedMessage = {
      ...message,
      messageId,
      timestamp: message.timestamp || Date.now()
    };
    
    // 去重检查
    if (this._isDuplicate(messageId)) {
      this.stats.dedupCount++;
      return { messageId, status: 'duplicate', message: '消息已处理' };
    }
    
    // 选择发送通道
    const channel = this._selectChannel(options);
    
    try {
      // 记录消息发送
      this._recordMessage(messageId);
      
      // 发送消息
      const result = await channel.send(enrichedMessage);
      
      // 更新统计
      if (channel === this.fastPath) {
        this.stats.fastPathCount++;
      } else {
        this.stats.reliablePathCount++;
      }
      
      return { messageId, status: 'sent', channel: channel.name };
    } catch (error) {
      this.stats.errorCount++;
      this.emit('error', { type: 'send', message: enrichedMessage, error });
      throw error;
    }
  }
  
  /**
   * 发送到指定 Agent
   * @param {string} agentId Agent ID
   * @param {Object} content 消息内容
   * @param {Object} options 发送选项
   */
  async sendToAgent(agentId, content, options = {}) {
    return this.send({
      type: 'agent_message',
      receiver: agentId,
      content,
      meetingId: options.meetingId
    }, options);
  }
  
  /**
   * 广播消息
   * @param {string[]} agentIds Agent ID 列表
   * @param {Object} content 消息内容
   * @param {Object} options 发送选项
   */
  async broadcast(agentIds, content, options = {}) {
    const results = [];
    
    for (const agentId of agentIds) {
      const result = await this.sendToAgent(agentId, content, options);
      results.push({ agentId, ...result });
    }
    
    return results;
  }
  
  /**
   * 发送并等待响应
   * @param {Object} message 消息对象
   * @param {number} timeout 超时时间（毫秒）
   */
  async sendAndWait(message, timeout = 30000) {
    const messageId = message.messageId || uuidv4();
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handlers.delete(messageId);
        reject(new Error(`消息响应超时: ${messageId}`));
      }, timeout);
      
      // 注册响应处理器
      this.handlers.set(messageId, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
      
      this.send({ ...message, messageId });
    });
  }
  
  // ==================== 消息接收 ====================
  
  /**
   * 处理接收到的消息
   */
  _handleMessage(channelType, message) {
    // 去重检查
    if (this._isDuplicate(message.messageId)) {
      this.stats.dedupCount++;
      return;
    }
    
    // 记录消息
    this._recordMessage(message.messageId);
    
    // 检查是否有等待的处理器
    const handler = this.handlers.get(message.messageId);
    if (handler) {
      handler(message);
      this.handlers.delete(message.messageId);
      return;
    }
    
    // 触发事件
    this.emit('message', { channel: channelType, message });
  }
  
  /**
   * 订阅消息
   * @param {string} pattern 消息模式
   * @param {Function} handler 处理函数
   */
  subscribe(pattern, handler) {
    this.on('message', ({ channel, message }) => {
      if (this._matchPattern(message, pattern)) {
        handler(message);
      }
    });
  }
  
  // ==================== 工具方法 ====================
  
  /**
   * 选择发送通道
   */
  _selectChannel(options) {
    // 强制使用 ReliablePath
    if (options.reliable && this.reliablePath) {
      return this.reliablePath;
    }
    
    // 默认使用 FastPath
    return this.fastPath;
  }
  
  /**
   * 检查消息是否重复
   */
  _isDuplicate(messageId) {
    return this.dedupCache.has(messageId);
  }
  
  /**
   * 记录消息
   */
  _recordMessage(messageId) {
    this.dedupCache.set(messageId, Date.now());
    
    // 清理过期缓存
    this._cleanupDedupCache();
  }
  
  /**
   * 清理过期的去重缓存
   */
  _cleanupDedupCache() {
    const now = Date.now();
    const ttl = this.options.dedupTTL;
    
    for (const [id, timestamp] of this.dedupCache.entries()) {
      if (now - timestamp > ttl) {
        this.dedupCache.delete(id);
      }
    }
  }
  
  /**
   * 匹配消息模式
   */
  _matchPattern(message, pattern) {
    if (typeof pattern === 'string') {
      return message.type === pattern;
    }
    if (pattern instanceof RegExp) {
      return pattern.test(message.type);
    }
    if (typeof pattern === 'function') {
      return pattern(message);
    }
    return true;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      dedupCacheSize: this.dedupCache.size,
      pendingHandlers: this.handlers.size
    };
  }
  
  /**
   * 关闭连接
   */
  async close() {
    if (this.fastPath) {
      await this.fastPath.close();
    }
    if (this.reliablePath) {
      await this.reliablePath.close();
    }
    this.dedupCache.clear();
    this.handlers.clear();
  }
}

/**
 * FastPath 通道（EventEmitter 实现）
 */
class FastPathChannel extends EventEmitter {
  constructor() {
    super();
    this.name = 'fast';
    this.isRunning = true;
  }
  
  async send(message) {
    if (!this.isRunning) {
      throw new Error('FastPath 通道已关闭');
    }
    
    // 模拟异步发送（实际是同步）
    setImmediate(() => {
      this.emit('message', message);
    });
    
    return { delivered: true, timestamp: Date.now() };
  }
  
  async close() {
    this.isRunning = false;
    this.removeAllListeners();
  }
}

/**
 * ReliablePath 通道（BullMQ 实现）
 */
class ReliablePathChannel extends EventEmitter {
  constructor(connection) {
    super();
    this.name = 'reliable';
    this.connection = connection;
    this.queue = null;
    this.worker = null;
    this.isRunning = false;
    
    this._initialize();
  }
  
  _initialize() {
    if (!Queue) {
      throw new Error('BullMQ 未安装');
    }
    
    // 创建队列
    this.queue = new Queue('pandaclaw-messages', { connection: this.connection });
    
    // 创建消费者
    this._startWorker();
    
    this.isRunning = true;
  }
  
  async _startWorker() {
    const { Worker } = require('bullmq');
    
    this.worker = new Worker(
      'pandaclaw-messages',
      async (job) => {
        this.emit('message', job.data);
        return { processed: true };
      },
      { connection: this.connection }
    );
    
    this.worker.on('error', (error) => {
      this.emit('error', error);
    });
  }
  
  async send(message) {
    if (!this.isRunning) {
      throw new Error('ReliablePath 通道已关闭');
    }
    
    const job = await this.queue.add('message', message, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
    
    return { jobId: job.id, delivered: true, timestamp: Date.now() };
  }
  
  async close() {
    this.isRunning = false;
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    this.removeAllListeners();
  }
}

module.exports = { MessageAdapter, FastPathChannel, ReliablePathChannel };