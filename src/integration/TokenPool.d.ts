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
/** 令牌池配置（来自契约 TOKEN_POOL_CONFIG） */
export declare const TOKEN_POOL_CONFIG: {
    readonly maxSize: 10;
    readonly acquireTimeout: 30000;
    readonly priorityLevels: 3;
};
/** 优先级类型 */
export type Priority = 'high' | 'normal' | 'low';
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
export declare class TokenPool extends EventEmitter {
    private maxSize;
    private acquireTimeout;
    private priorityLevels;
    private availableTokens;
    private waitingQueue;
    private acquiredTokens;
    private stats;
    constructor(options?: TokenPoolOptions);
    private _initializePool;
    /**
     * 获取令牌（符合契约）
     * @param priority 优先级
     * @param agentId Agent ID（可选）
     * @returns Promise<Token> 令牌对象
     */
    acquire(priority?: Priority, agentId?: string): Promise<Token>;
    /**
     * 释放令牌
     * @param tokenId 令牌ID
     */
    release(tokenId: string): Promise<void>;
    /**
     * 获取令牌池状态（符合 TokenPoolStatus 契约）
     */
    getStatus(): TokenPoolStatus;
    /**
     * 获取统计信息
     */
    getStats(): Record<string, number>;
    private _grantToken;
    private _waitForToken;
    private _priorityFromValue;
    /**
     * 强制释放所有令牌（用于清理）
     */
    forceReleaseAll(): Promise<void>;
    /**
     * 关闭令牌池
     */
    close(): Promise<void>;
}
export default TokenPool;
//# sourceMappingURL=TokenPool.d.ts.map