/**
 * TokenPool - 令牌池管理（符合契约 v1）
 * @author npc-2 (AI工程师)
 * @version 1.0.0
 * @contract contracts/messages.ts (TOKEN_POOL_CONFIG)
 * 
 * 功能：
 * - 令牌获取/释放
 * - 超时等待策略
 * - 优先级队列
 * - 状态监控
 */

import { EventEmitter } from 'events';

/** 契约版本号 */
const CONTRACT_VERSION = 1;

/** 令牌池配置（来自契约 TOKEN_POOL_CONFIG） */
export const TOKEN_POOL_CONFIG = {
  maxSize: 10,              // 最大令牌数
  acquireTimeout: 30000,    // 获取令牌超时（毫秒）
  priorityLevels: 3,        // 优先级级别 (0: low, 1: normal, 2: high)
} as const;

/** 优先级类型 */
export type Priority = 'high' | 'normal' | 'low';

/** 优先级数值映射 */
const PRIORITY_MAP: Record<Priority, number> = {
  'high': 2,
  'normal': 1,
  'low': 0
};

/** 等待队列项 */
interface WaitingItem {
  id: string;
  priority: number;
  timestamp: number;
  agentId?: string;           // Agent ID（可选）
  resolve: (token: Token) => void;
  reject: (error: Error) => void;
  timeoutTimer: NodeJS.Timeout;
}

/** 令牌对象 */
export interface Token {
  id: string;
  acquiredAt: number;
  priority: Priority;
  agentId?: string;
}

/** 令牌池状态（符合 TokenPoolStatus 契约） */
export interface TokenPoolStatus {
  available: number;
  waiting: number;
  total: number;
}

/** 令牌池配置接口 */
export interface TokenPoolOptions {
  maxSize?: number;
  acquireTimeout?: number;
  priorityLevels?: number;
}

/**
 * 令牌池类
 */
export class TokenPool extends EventEmitter {
  private maxSize: number;
  private acquireTimeout: number;
  private priorityLevels: number;
  
  private availableTokens: Token[] = [];
  private waitingQueue: WaitingItem[] = [];
  private acquiredTokens: Map<string, Token> = new Map();
  
  private stats = {
    acquiredCount: 0,
    releasedCount: 0,
    timeoutCount: 0,
    totalWaitTime: 0,
    maxWaitTime: 0
  };
  
  constructor(options: TokenPoolOptions = {}) {
    super();
    
    this.maxSize = options.maxSize ?? TOKEN_POOL_CONFIG.maxSize;
    this.acquireTimeout = options.acquireTimeout ?? TOKEN_POOL_CONFIG.acquireTimeout;
    this.priorityLevels = options.priorityLevels ?? TOKEN_POOL_CONFIG.priorityLevels;
    
    // 初始化令牌池
    this._initializePool();
    
    console.log(`✅ TokenPool 初始化完成 (契约 v${CONTRACT_VERSION})`);
    console.log(`   最大令牌数: ${this.maxSize}`);
    console.log(`   获取超时: ${this.acquireTimeout}ms`);
    console.log(`   优先级级别: ${this.priorityLevels}`);
  }
  
  private _initializePool(): void {
    for (let i = 0; i < this.maxSize; i++) {
      this.availableTokens.push({
        id: `token-${i}`,
        acquiredAt: 0,
        priority: 'normal'
      });
    }
  }
  
  /**
   * 获取令牌（符合契约）
   * @param priority 优先级
   * @param agentId Agent ID（可选）
   * @returns Promise<Token> 令牌对象
   */
  async acquire(priority: Priority = 'normal', agentId?: string): Promise<Token> {
    const priorityValue = PRIORITY_MAP[priority];
    
    // 如果有可用令牌，直接获取
    if (this.availableTokens.length > 0) {
      return this._grantToken(priority, agentId);
    }
    
    // 否则加入等待队列
    return this._waitForToken(priority, priorityValue, agentId);
  }
  
  /**
   * 释放令牌
   * @param tokenId 令牌ID
   */
  async release(tokenId: string): Promise<void> {
    const token = this.acquiredTokens.get(tokenId);
    if (!token) {
      console.warn(`⚠️ 令牌 ${tokenId} 不存在或已释放`);
      return;
    }
    
    this.acquiredTokens.delete(tokenId);
    
    // 重置令牌
    token.acquiredAt = 0;
    token.agentId = undefined;
    
    // 检查等待队列
    if (this.waitingQueue.length > 0) {
      // 按优先级排序（高优先级优先）
      this.waitingQueue.sort((a, b) => b.priority - a.priority);
      
      const next = this.waitingQueue.shift();
      if (next) {
        clearTimeout(next.timeoutTimer);
        
        token.acquiredAt = Date.now();
        token.priority = this._priorityFromValue(next.priority);
        token.agentId = next.agentId;
        
        this.acquiredTokens.set(token.id, token);
        this.stats.acquiredCount++;
        
        next.resolve(token);
        this.emit('granted', { token, fromWait: true });
        return;
      }
    }
    
    // 没有等待者，归还令牌池
    this.availableTokens.push(token);
    this.stats.releasedCount++;
    this.emit('released', { tokenId });
  }
  
  /**
   * 获取令牌池状态（符合 TokenPoolStatus 契约）
   */
  getStatus(): TokenPoolStatus {
    return {
      available: this.availableTokens.length,
      waiting: this.waitingQueue.length,
      total: this.maxSize
    };
  }
  
  /**
   * 获取统计信息
   */
  getStats(): Record<string, number> {
    const avgWaitTime = this.stats.acquiredCount > 0
      ? Math.round(this.stats.totalWaitTime / this.stats.acquiredCount)
      : 0;
    
    return {
      ...this.stats,
      avgWaitTime,
      currentAvailable: this.availableTokens.length,
      currentWaiting: this.waitingQueue.length,
      currentAcquired: this.acquiredTokens.size
    };
  }
  
  // ==================== 内部方法 ====================
  
  private _grantToken(priority: Priority, agentId?: string): Token {
    const token = this.availableTokens.shift()!;
    token.acquiredAt = Date.now();
    token.priority = priority;
    token.agentId = agentId;
    
    this.acquiredTokens.set(token.id, token);
    this.stats.acquiredCount++;
    
    this.emit('granted', { token, fromWait: false });
    return token;
  }
  
  private async _waitForToken(
    priority: Priority,
    priorityValue: number,
    agentId?: string
  ): Promise<Token> {
    return new Promise((resolve, reject) => {
      const id = `wait-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timestamp = Date.now();
      
      const timeoutTimer = setTimeout(() => {
        // 从等待队列移除
        const index = this.waitingQueue.findIndex(w => w.id === id);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        
        this.stats.timeoutCount++;
        this.emit('timeout', { id, priority, agentId });
        
        reject(new Error(`令牌获取超时 (${this.acquireTimeout}ms)`));
      }, this.acquireTimeout);
      
      const item: WaitingItem = {
        id,
        priority: priorityValue,
        timestamp,
        resolve: (token) => {
          const waitTime = Date.now() - timestamp;
          this.stats.totalWaitTime += waitTime;
          if (waitTime > this.stats.maxWaitTime) {
            this.stats.maxWaitTime = waitTime;
          }
          resolve(token);
        },
        reject,
        timeoutTimer
      };
      
      // 添加 agentId 到等待项
      (item as any).agentId = agentId;
      
      this.waitingQueue.push(item);
      this.emit('waiting', { id, priority, agentId, queueLength: this.waitingQueue.length });
    });
  }
  
  private _priorityFromValue(value: number): Priority {
    if (value >= 2) return 'high';
    if (value >= 1) return 'normal';
    return 'low';
  }
  
  /**
   * 强制释放所有令牌（用于清理）
   */
  async forceReleaseAll(): Promise<void> {
    for (const [tokenId, token] of this.acquiredTokens) {
      this.acquiredTokens.delete(tokenId);
      token.acquiredAt = 0;
      token.agentId = undefined;
      this.availableTokens.push(token);
    }
    
    // 清理等待队列
    for (const item of this.waitingQueue) {
      clearTimeout(item.timeoutTimer);
      item.reject(new Error('令牌池已关闭'));
    }
    this.waitingQueue = [];
    
    this.emit('forceReleased', { count: this.availableTokens.length });
  }
  
  /**
   * 关闭令牌池
   */
  async close(): Promise<void> {
    await this.forceReleaseAll();
    this.removeAllListeners();
    console.log('✅ TokenPool 已关闭');
  }
}

export default TokenPool;