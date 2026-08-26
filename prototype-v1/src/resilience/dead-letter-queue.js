/**
 * PandaClaw 死信队列模块
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 基于契约: contracts/events.ts - DeadLetterEvent
 *            contracts/messages.ts - QUEUE_CONFIG.DEAD_LETTER_QUEUE
 * 
 * 功能:
 * - 消息持久化
 * - TTL 过期清理
 * - 重放机制
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

// ============================================
// 死信队列配置
// ============================================

const DLQ_CONFIG = {
  queueName: 'pandaclaw:dead-letter',
  maxRetentionDays: 7,           // 最大保留7天
  maxEntries: 10000,             // 最大条目数
  cleanupInterval: 3600000,      // 清理间隔 1小时
  replayBatchSize: 100,          // 重放批次大小
};

// ============================================
// 死信队列类
// ============================================

class DeadLetterQueue extends EventEmitter {
  constructor(redisClient, config = {}) {
    super();
    this.redis = redisClient;
    this.config = { ...DLQ_CONFIG, ...config };
    this.storageKey = this.config.queueName;
    this.cleanupTimer = null;
    
    // 启动清理定时器
    this.startCleanup();
  }
  
  /**
   * 添加死信消息
   * @param {Object} originalEvent - 原始事件
   * @param {string} failureReason - 失败原因
   * @param {number} retryCount - 重试次数
   * @returns {Promise<string>} 死信ID
   */
  async add(originalEvent, failureReason, retryCount) {
    const deadLetterId = uuidv4();
    const now = Date.now();
    
    const deadLetterEvent = {
      id: deadLetterId,
      version: 1,
      originalEvent,
      failureReason,
      retryCount,
      failedAt: now,
      expiresAt: now + (this.config.maxRetentionDays * 24 * 60 * 60 * 1000),
      status: 'pending',          // pending | replayed | expired | discarded
      replayAttempts: 0,
    };
    
    // 存储到 Redis
    try {
      await this.redis.hset(
        this.storageKey,
        deadLetterId,
        JSON.stringify(deadLetterEvent)
      );
      
      // 发出事件
      this.emit('added', deadLetterEvent);
      
      // 检查是否超过最大条目数
      const count = await this.count();
      if (count > this.config.maxEntries) {
        await this.trimToSize(this.config.maxEntries);
        this.emit('trimmed', { removed: count - this.config.maxEntries });
      }
      
      return deadLetterId;
    } catch (error) {
      this.emit('error', { operation: 'add', error: error.message });
      throw error;
    }
  }
  
  /**
   * 获取死信消息
   * @param {string} id - 死信ID
   * @returns {Promise<Object|null>}
   */
  async get(id) {
    try {
      const data = await this.redis.hget(this.storageKey, id);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.emit('error', { operation: 'get', id, error: error.message });
      throw error;
    }
  }
  
  /**
   * 获取所有死信消息
   * @param {Object} filter - 筛选条件
   * @returns {Promise<Array>}
   */
  async getAll(filter = {}) {
    try {
      const all = await this.redis.hgetall(this.storageKey);
      let entries = Object.values(all).map(data => JSON.parse(data));
      
      // 应用筛选
      if (filter.status) {
        entries = entries.filter(e => e.status === filter.status);
      }
      if (filter.meetingId) {
        entries = entries.filter(e => e.originalEvent.meetingId === filter.meetingId);
      }
      if (filter.eventType) {
        entries = entries.filter(e => e.originalEvent.eventType === filter.eventType);
      }
      if (filter.minRetryCount) {
        entries = entries.filter(e => e.retryCount >= filter.minRetryCount);
      }
      
      // 按失败时间排序（最近的在前）
      entries.sort((a, b) => b.failedAt - a.failedAt);
      
      return entries;
    } catch (error) {
      this.emit('error', { operation: 'getAll', error: error.message });
      throw error;
    }
  }
  
  /**
   * 获取死信数量
   * @returns {Promise<number>}
   */
  async count() {
    try {
      return await this.redis.hlen(this.storageKey);
    } catch (error) {
      this.emit('error', { operation: 'count', error: error.message });
      throw error;
    }
  }
  
  /**
   * 标记为已重放
   * @param {string} id - 死信ID
   * @param {string} result - 重放结果
   */
  async markReplayed(id, result = 'success') {
    try {
      const entry = await this.get(id);
      if (!entry) {
        throw new Error(`Dead letter not found: ${id}`);
      }
      
      entry.status = 'replayed';
      entry.replayedAt = Date.now();
      entry.replayResult = result;
      entry.replayAttempts++;
      
      await this.redis.hset(this.storageKey, id, JSON.stringify(entry));
      this.emit('replayed', entry);
      
      return entry;
    } catch (error) {
      this.emit('error', { operation: 'markReplayed', id, error: error.message });
      throw error;
    }
  }
  
  /**
   * 标记为已丢弃
   * @param {string} id - 死信ID
   * @param {string} reason - 丢弃原因
   */
  async markDiscarded(id, reason) {
    try {
      const entry = await this.get(id);
      if (!entry) {
        throw new Error(`Dead letter not found: ${id}`);
      }
      
      entry.status = 'discarded';
      entry.discardedAt = Date.now();
      entry.discardReason = reason;
      
      await this.redis.hset(this.storageKey, id, JSON.stringify(entry));
      this.emit('discarded', entry);
      
      return entry;
    } catch (error) {
      this.emit('error', { operation: 'markDiscarded', id, error: error.message });
      throw error;
    }
  }
  
  /**
   * 重放死信消息
   * @param {string} id - 死信ID
   * @param {Function} handler - 处理函数
   * @returns {Promise<Object>}
   */
  async replay(id, handler) {
    try {
      const entry = await this.get(id);
      if (!entry) {
        throw new Error(`Dead letter not found: ${id}`);
      }
      
      if (entry.status !== 'pending') {
        throw new Error(`Dead letter already processed: ${entry.status}`);
      }
      
      // 调用处理函数
      const result = await handler(entry.originalEvent);
      
      // 标记为已重放
      await this.markReplayed(id, result.success ? 'success' : 'failed');
      
      this.emit('replaySuccess', { id, result });
      
      return { success: true, result };
    } catch (error) {
      // 重放失败，增加重试次数记录
      const entry = await this.get(id);
      if (entry) {
        entry.replayAttempts++;
        entry.lastReplayError = error.message;
        await this.redis.hset(this.storageKey, id, JSON.stringify(entry));
      }
      
      this.emit('replayFailed', { id, error: error.message });
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 批量重放
   * @param {Function} handler - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async replayBatch(handler, options = {}) {
    const batchSize = options.batchSize || this.config.replayBatchSize;
    
    try {
      // 获取待处理的死信
      const pending = await this.getAll({ status: 'pending' });
      const batch = pending.slice(0, batchSize);
      
      const results = {
        total: batch.length,
        succeeded: 0,
        failed: 0,
        errors: [],
      };
      
      for (const entry of batch) {
        const result = await this.replay(entry.id, handler);
        if (result.success) {
          results.succeeded++;
        } else {
          results.failed++;
          results.errors.push({ id: entry.id, error: result.error });
        }
      }
      
      this.emit('batchReplayed', results);
      
      return results;
    } catch (error) {
      this.emit('error', { operation: 'replayBatch', error: error.message });
      throw error;
    }
  }
  
  /**
   * 删除死信
   * @param {string} id - 死信ID
   */
  async delete(id) {
    try {
      const entry = await this.get(id);
      await this.redis.hdel(this.storageKey, id);
      this.emit('deleted', { id, entry });
    } catch (error) {
      this.emit('error', { operation: 'delete', id, error: error.message });
      throw error;
    }
  }
  
  /**
   * 清理过期死信
   * @returns {Promise<number>} 清理数量
   */
  async cleanupExpired() {
    try {
      const now = Date.now();
      const all = await this.getAll();
      const expired = all.filter(e => e.expiresAt < now && e.status === 'pending');
      
      for (const entry of expired) {
        entry.status = 'expired';
        entry.expiredAt = now;
        await this.redis.hset(this.storageKey, entry.id, JSON.stringify(entry));
      }
      
      if (expired.length > 0) {
        this.emit('expired', { count: expired.length, entries: expired });
      }
      
      return expired.length;
    } catch (error) {
      this.emit('error', { operation: 'cleanupExpired', error: error.message });
      throw error;
    }
  }
  
  /**
   * 修剪到指定大小
   * @param {number} maxSize - 最大条目数
   */
  async trimToSize(maxSize) {
    try {
      const all = await this.getAll();
      if (all.length <= maxSize) return 0;
      
      // 按时间排序，删除最旧的已处理条目
      const processed = all
        .filter(e => e.status !== 'pending')
        .sort((a, b) => a.failedAt - b.failedAt);
      
      const toRemove = processed.slice(0, all.length - maxSize);
      
      for (const entry of toRemove) {
        await this.redis.hdel(this.storageKey, entry.id);
      }
      
      return toRemove.length;
    } catch (error) {
      this.emit('error', { operation: 'trimToSize', error: error.message });
      throw error;
    }
  }
  
  /**
   * 启动清理定时器
   */
  startCleanup() {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(
      () => this.cleanupExpired().catch(err => this.emit('error', err)),
      this.config.cleanupInterval
    );
    
    this.emit('cleanupStarted', { interval: this.config.cleanupInterval });
  }
  
  /**
   * 停止清理定时器
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.emit('cleanupStopped');
    }
  }
  
  /**
   * 获取统计信息
   */
  async getStats() {
    const all = await this.getAll();
    
    return {
      total: all.length,
      pending: all.filter(e => e.status === 'pending').length,
      replayed: all.filter(e => e.status === 'replayed').length,
      expired: all.filter(e => e.status === 'expired').length,
      discarded: all.filter(e => e.status === 'discarded').length,
      oldestPending: all
        .filter(e => e.status === 'pending')
        .sort((a, b) => a.failedAt - b.failedAt)[0]?.failedAt || null,
    };
  }
  
  /**
   * 关闭
   */
  async close() {
    this.stopCleanup();
    this.emit('closed');
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  DeadLetterQueue,
  DLQ_CONFIG,
  
  // 快捷工厂函数
  createDLQ: (redisClient, config) => new DeadLetterQueue(redisClient, config),
};