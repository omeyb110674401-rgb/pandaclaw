/**
 * LLMScheduler - LLM调度器（符合契约 v1）
 * @author npc-2 (AI工程师)
 * @version 1.0.0
 * @contract contracts/messages.ts (TOKEN_POOL_CONFIG)
 * 
 * 功能：
 * - 令牌池管理（并发控制）
 * - 优先级调度
 * - 超时处理
 * - 错误恢复
 */

import { EventEmitter } from 'events';
import { TokenPool, Token, Priority, TOKEN_POOL_CONFIG } from './TokenPool';

/** 契约版本号 */
const CONTRACT_VERSION = 1;

/** LLM 调度配置 */
export const LLM_SCHEDULER_CONFIG = {
  maxConcurrent: 10,           // 最大并发数
  defaultTimeout: 60000,       // 默认超时（毫秒）
  retryAttempts: 3,            // 重试次数
  retryDelay: 2000,            // 重试延迟（毫秒）
  rateLimitPerMinute: 60,      // 每分钟速率限制
} as const;

/** LLM 调度请求 */
export interface LLMScheduleRequest {
  agentId: string;             // Agent ID
  prompt: string;              // 提示词
  priority?: Priority;         // 优先级
  timeout?: number;            // 超时时间
  context?: Record<string, any>; // 上下文数据
  requestId?: string;          // 请求ID
}

/** LLM 调度响应 */
export interface LLMScheduleResponse {
  requestId: string;           // 请求ID
  tokenId: string;             // 令牌ID
  success: boolean;            // 是否成功
  result?: any;                // LLM 结果
  error?: {
    code: string;
    message: string;
    retriable: boolean;
  };
  latency: number;             // 延迟（毫秒）
  waitedForToken: number;      // 等待令牌时间
}

/** 调度器配置 */
export interface LLMSchedulerOptions {
  maxConcurrent?: number;
  defaultTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  rateLimitPerMinute?: number;
}

/** LLM 调用函数类型 */
type LLMCallFunction = (prompt: string, context?: Record<string, any>) => Promise<any>;

/**
 * LLM 调度器
 */
export class LLMScheduler extends EventEmitter {
  private tokenPool: TokenPool;
  private defaultTimeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private rateLimitPerMinute: number;
  
  private llmCallFn?: LLMCallFunction;
  private rateLimiter: Map<string, number[]> = new Map(); // agentId -> timestamps
  private rateLimiterCleanupTimer?: NodeJS.Timeout;       // 定时清理
  
  private stats = {
    scheduledCount: 0,
    completedCount: 0,
    failedCount: 0,
    retriedCount: 0,
    rateLimitedCount: 0,
    totalLatency: 0,
    totalTokenWait: 0,
    maxLatency: 0
  };
  
  constructor(options: LLMSchedulerOptions = {}) {
    super();
    
    this.defaultTimeout = options.defaultTimeout ?? LLM_SCHEDULER_CONFIG.defaultTimeout;
    this.retryAttempts = options.retryAttempts ?? LLM_SCHEDULER_CONFIG.retryAttempts;
    this.retryDelay = options.retryDelay ?? LLM_SCHEDULER_CONFIG.retryDelay;
    this.rateLimitPerMinute = options.rateLimitPerMinute ?? LLM_SCHEDULER_CONFIG.rateLimitPerMinute;
    
    // 初始化令牌池
    this.tokenPool = new TokenPool({
      maxSize: options.maxConcurrent ?? TOKEN_POOL_CONFIG.maxSize,
      acquireTimeout: TOKEN_POOL_CONFIG.acquireTimeout,
      priorityLevels: TOKEN_POOL_CONFIG.priorityLevels
    });
    
    // 监听令牌池事件
    this.tokenPool.on('granted', (data) => this.emit('tokenGranted', data));
    this.tokenPool.on('released', (data) => this.emit('tokenReleased', data));
    this.tokenPool.on('waiting', (data) => this.emit('tokenWaiting', data));
    this.tokenPool.on('timeout', (data) => {
      this.stats.failedCount++;
      this.emit('tokenTimeout', data);
    });
    
    // 启动速率限制器定时清理（每分钟清理过期记录）
    this._startRateLimiterCleanup();
    
    console.log(`✅ LLMScheduler 初始化完成 (契约 v${CONTRACT_VERSION})`);
    console.log(`   最大并发: ${this.tokenPool.getStatus().total}`);
    console.log(`   默认超时: ${this.defaultTimeout}ms`);
    console.log(`   速率限制: ${this.rateLimitPerMinute}/分钟`);
  }
  
  /**
   * 启动速率限制器定时清理
   */
  private _startRateLimiterCleanup(): void {
    this.rateLimiterCleanupTimer = setInterval(() => {
      this._cleanupRateLimiter();
    }, 60000); // 每分钟清理
  }
  
  /**
   * 清理速率限制器过期记录
   */
  private _cleanupRateLimiter(): void {
    const oneMinuteAgo = Date.now() - 60000;
    let cleanedCount = 0;
    
    for (const [agentId, timestamps] of this.rateLimiter.entries()) {
      const filtered = timestamps.filter(t => t > oneMinuteAgo);
      
      if (filtered.length === 0) {
        // 无活跃记录，移除整个 agentId
        this.rateLimiter.delete(agentId);
        cleanedCount++;
      } else if (filtered.length !== timestamps.length) {
        this.rateLimiter.set(agentId, filtered);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.emit('rateLimiterCleanup', { cleanedCount, remainingAgents: this.rateLimiter.size });
    }
  }
  
  /**
   * 设置 LLM 调用函数
   * @param fn LLM 调用函数
   */
  setLLMCallFunction(fn: LLMCallFunction): void {
    this.llmCallFn = fn;
    console.log('   LLM 调用函数已绑定');
  }
  
  /**
   * 调度 LLM 调用
   * @param request 调度请求
   * @returns Promise<LLMScheduleResponse> 调度响应
   */
  async schedule(request: LLMScheduleRequest): Promise<LLMScheduleResponse> {
    const requestId = request.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const priority = request.priority ?? 'normal';
    const timeout = request.timeout ?? this.defaultTimeout;
    
    const startTime = Date.now();
    let waitedForToken = 0;
    
    // 速率限制检查
    if (this._isRateLimited(request.agentId)) {
      this.stats.rateLimitedCount++;
      this.emit('rateLimited', { agentId: request.agentId, requestId });
      
      // 等待速率限制解除
      await this._waitForRateLimit(request.agentId);
    }
    
    this.stats.scheduledCount++;
    this.emit('scheduled', { requestId, agentId: request.agentId, priority });
    
    // 获取令牌
    const tokenStartTime = Date.now();
    let token: Token;
    
    try {
      token = await this.tokenPool.acquire(priority, request.agentId);
      waitedForToken = Date.now() - tokenStartTime;
      this.stats.totalTokenWait += waitedForToken;
    } catch (error) {
      return {
        requestId,
        tokenId: '',
        success: false,
        error: {
          code: 'TOKEN_TIMEOUT',
          message: (error as Error).message,
          retriable: true
        },
        latency: Date.now() - startTime,
        waitedForToken
      };
    }
    
    // 执行 LLM 调用（带重试）
    let lastError: Error | null = null;
    let result: any = null;
    
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        result = await this._callLLM(request.prompt, request.context, timeout);
        
        // 更新统计
        const latency = Date.now() - startTime;
        this.stats.totalLatency += latency;
        if (latency > this.stats.maxLatency) {
          this.stats.maxLatency = latency;
        }
        this.stats.completedCount++;
        
        // 释放令牌
        await this.tokenPool.release(token.id);
        
        // 记录速率
        this._recordRate(request.agentId);
        
        this.emit('completed', { requestId, latency, attempt });
        
        return {
          requestId,
          tokenId: token.id,
          success: true,
          result,
          latency,
          waitedForToken
        };
      } catch (error) {
        lastError = error as Error;
        this.stats.retriedCount++;
        
        if (attempt < this.retryAttempts) {
          await this._delay(this.retryDelay * Math.pow(2, attempt));
          this.emit('retry', { requestId, attempt, error: lastError });
        }
      }
    }
    
    // 所有重试失败
    this.stats.failedCount++;
    
    // 释放令牌
    await this.tokenPool.release(token.id);
    
    this.emit('failed', { requestId, error: lastError });
    
    return {
      requestId,
      tokenId: token.id,
      success: false,
      error: {
        code: 'LLM_CALL_FAILED',
        message: lastError?.message || 'LLM 调用失败',
        retriable: false
      },
      latency: Date.now() - startTime,
      waitedForToken
    };
  }
  
  /**
   * 批量调度
   * @param requests 调度请求列表
   * @returns Promise<LLMScheduleResponse[]> 调度响应列表
   */
  async scheduleBatch(requests: LLMScheduleRequest[]): Promise<LLMScheduleResponse[]> {
    // 并行调度
    const promises = requests.map(req => this.schedule(req));
    return Promise.all(promises);
  }
  
  /**
   * 获取调度器状态
   */
  getStatus(): {
    tokenPool: ReturnType<TokenPool['getStatus']>;
    scheduler: Record<string, number>;
  } {
    return {
      tokenPool: this.tokenPool.getStatus(),
      scheduler: this.getStats()
    };
  }
  
  /**
   * 获取统计信息
   */
  getStats(): Record<string, number> {
    const avgLatency = this.stats.completedCount > 0
      ? Math.round(this.stats.totalLatency / this.stats.completedCount)
      : 0;
    
    const avgTokenWait = this.stats.scheduledCount > 0
      ? Math.round(this.stats.totalTokenWait / this.stats.scheduledCount)
      : 0;
    
    return {
      ...this.stats,
      avgLatency,
      avgTokenWait,
      rateLimit: this.rateLimitPerMinute
    };
  }
  
  /**
   * 获取令牌池统计
   */
  getTokenPoolStats(): ReturnType<TokenPool['getStats']> {
    return this.tokenPool.getStats();
  }
  
  // ==================== 内部方法 ====================
  
  private async _callLLM(
    prompt: string,
    context?: Record<string, any>,
    timeout?: number
  ): Promise<any> {
    if (!this.llmCallFn) {
      throw new Error('LLM 调用函数未设置');
    }
    
    // 超时包装
    const timeoutMs = timeout ?? this.defaultTimeout;
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`LLM 调用超时 (${timeoutMs}ms)`));
      }, timeoutMs);
      
      this.llmCallFn!(prompt, context)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
  
  private _isRateLimited(agentId: string): boolean {
    const timestamps = this.rateLimiter.get(agentId) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // 过滤一分钟内的请求
    const recentCount = timestamps.filter(t => t > oneMinuteAgo).length;
    
    return recentCount >= this.rateLimitPerMinute;
  }
  
  private _recordRate(agentId: string): void {
    const timestamps = this.rateLimiter.get(agentId) || [];
    timestamps.push(Date.now());
    
    // 只保留最近一分钟的记录
    const oneMinuteAgo = Date.now() - 60000;
    const filtered = timestamps.filter(t => t > oneMinuteAgo);
    
    this.rateLimiter.set(agentId, filtered);
  }
  
  private async _waitForRateLimit(agentId: string): Promise<void> {
    const timestamps = this.rateLimiter.get(agentId) || [];
    if (timestamps.length === 0) return;
    
    // 计算最早的请求时间 + 1分钟 - 当前时间
    const earliest = Math.min(...timestamps);
    const waitTime = earliest + 60000 - Date.now();
    
    if (waitTime > 0) {
      await this._delay(waitTime);
    }
  }
  
  private async _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 关闭调度器
   */
  async close(): Promise<void> {
    // 停止定时清理
    if (this.rateLimiterCleanupTimer) {
      clearInterval(this.rateLimiterCleanupTimer);
      this.rateLimiterCleanupTimer = undefined;
    }
    
    await this.tokenPool.close();
    this.rateLimiter.clear();
    this.removeAllListeners();
    console.log('✅ LLMScheduler 已关闭');
  }
}

export default LLMScheduler;