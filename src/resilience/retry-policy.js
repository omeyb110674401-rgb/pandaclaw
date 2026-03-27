/**
 * PandaClaw 重试策略模块
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 基于契约: contracts/messages.ts - QUEUE_CONFIG.RETRY
 * 
 * 配置:
 * - maxRetries: 3
 * - exponential backoff
 * - delay: 1000ms
 */

const { EventEmitter } = require('events');

// ============================================
// 重试配置（从契约同步）
// ============================================

const RETRY_CONFIG = {
  maxRetries: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,              // 基础延迟 1秒
    maxDelay: 30000,          // 最大延迟 30秒
    multiplier: 2,            // 倍数
    jitter: 0.1,              // 10% 随机抖动（防止惊群效应）
  },
  
  // 可重试的错误类型
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
  ],
  
  // 可重试的 HTTP 状态码
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

// ============================================
// 重试策略类
// ============================================

class RetryPolicy extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      ...RETRY_CONFIG,
      ...config,
    };
  }
  
  /**
   * 计算退避延迟
   * @param {number} attempt - 当前尝试次数（从0开始）
   * @returns {number} 延迟毫秒数
   */
  calculateDelay(attempt) {
    const { delay, maxDelay, multiplier, jitter } = this.config.backoff;
    
    // 指数退避: delay * multiplier^attempt
    let baseDelay = delay * Math.pow(multiplier, attempt);
    
    // 添加抖动
    if (jitter > 0) {
      const jitterFactor = 1 - jitter + (Math.random() * 2 * jitter);
      baseDelay = baseDelay * jitterFactor;
    }
    
    // 限制最大延迟
    return Math.min(Math.floor(baseDelay), maxDelay);
  }
  
  /**
   * 判断是否可重试
   * @param {Error} error - 错误对象
   * @returns {boolean}
   */
  isRetryable(error) {
    // 检查错误码
    if (this.config.retryableErrors.includes(error.code)) {
      return true;
    }
    
    // 检查 HTTP 状态码
    if (error.statusCode && this.config.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }
    
    // 检查错误消息中的关键词
    const retryablePatterns = [
      /timeout/i,
      /rate limit/i,
      /temporarily unavailable/i,
      /connection reset/i,
      /network error/i,
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }
  
  /**
   * 执行带重试的函数
   * @param {Function} fn - 要执行的函数
   * @param {Object} options - 执行选项
   * @returns {Promise<any>}
   */
  async execute(fn, options = {}) {
    const maxRetries = options.maxRetries || this.config.maxRetries;
    const onRetry = options.onRetry || null;
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        
        // 成功时发出事件
        if (attempt > 0) {
          this.emit('success', { attempt, totalAttempts: attempt + 1 });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // 最后一次尝试不重试
        if (attempt === maxRetries) {
          break;
        }
        
        // 判断是否可重试
        if (!this.isRetryable(error) && !options.forceRetry) {
          this.emit('nonRetryable', { error, attempt });
          throw error;
        }
        
        // 计算延迟
        const delay = this.calculateDelay(attempt);
        
        // 发出重试事件
        this.emit('retry', {
          attempt,
          nextAttempt: attempt + 1,
          delay,
          error: error.message,
        });
        
        // 调用自定义重试回调
        if (onRetry) {
          await onRetry({ attempt, error, delay });
        }
        
        // 等待延迟
        await this.sleep(delay);
      }
    }
    
    // 所有重试失败
    this.emit('exhausted', {
      totalAttempts: maxRetries + 1,
      lastError: lastError.message,
    });
    
    const exhaustedError = new Error(`Max retries (${maxRetries}) exhausted: ${lastError.message}`);
    exhaustedError.code = 'MAX_RETRIES_EXHAUSTED';
    exhaustedError.originalError = lastError;
    exhaustedError.attempts = maxRetries + 1;
    
    throw exhaustedError;
  }
  
  /**
   * 创建重试包装器
   * @param {Function} fn - 要包装的函数
   * @returns {Function}
   */
  wrap(fn) {
    return (...args) => this.execute(() => fn(...args));
  }
  
  /**
   * 等待
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    this.emit('configUpdated', this.config);
  }
}

// ============================================
// 预定义重试策略
// ============================================

const RetryStrategies = {
  // 激进重试（快速恢复）
  aggressive: new RetryPolicy({
    maxRetries: 5,
    backoff: { delay: 500, multiplier: 1.5, maxDelay: 5000, jitter: 0.2 },
  }),
  
  // 标准重试
  standard: new RetryPolicy({
    maxRetries: 3,
    backoff: { delay: 1000, multiplier: 2, maxDelay: 30000, jitter: 0.1 },
  }),
  
  // 保守重试（慢恢复）
  conservative: new RetryPolicy({
    maxRetries: 2,
    backoff: { delay: 5000, multiplier: 2, maxDelay: 60000, jitter: 0.05 },
  }),
  
  // LLM 调用专用（长超时）
  llm: new RetryPolicy({
    maxRetries: 3,
    backoff: { delay: 2000, multiplier: 2, maxDelay: 120000, jitter: 0.15 },
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'CONTEXT_TOO_LONG'],
  }),
  
  // Redis 专用（快速重试）
  redis: new RetryPolicy({
    maxRetries: 3,
    backoff: { delay: 100, multiplier: 2, maxDelay: 1000, jitter: 0.1 },
    retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'],
  }),
};

// ============================================
// 导出
// ============================================

module.exports = {
  RetryPolicy,
  RetryStrategies,
  RETRY_CONFIG,
  
  // 快捷工厂函数
  createRetryPolicy: (config) => new RetryPolicy(config),
};