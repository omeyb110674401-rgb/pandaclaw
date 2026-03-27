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
import { TokenPool, Priority } from './TokenPool';
/** LLM 调度配置 */
export declare const LLM_SCHEDULER_CONFIG: {
    readonly maxConcurrent: 10;
    readonly defaultTimeout: 60000;
    readonly retryAttempts: 3;
    readonly retryDelay: 2000;
    readonly rateLimitPerMinute: 60;
};
/** LLM 调度请求 */
export interface LLMScheduleRequest {
    agentId: string;
    prompt: string;
    priority?: Priority;
    timeout?: number;
    context?: Record<string, any>;
    requestId?: string;
}
/** LLM 调度响应 */
export interface LLMScheduleResponse {
    requestId: string;
    tokenId: string;
    success: boolean;
    result?: any;
    error?: {
        code: string;
        message: string;
        retriable: boolean;
    };
    latency: number;
    waitedForToken: number;
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
export declare class LLMScheduler extends EventEmitter {
    private tokenPool;
    private defaultTimeout;
    private retryAttempts;
    private retryDelay;
    private rateLimitPerMinute;
    private llmCallFn?;
    private rateLimiter;
    private rateLimiterCleanupTimer?;
    private stats;
    constructor(options?: LLMSchedulerOptions);
    /**
     * 启动速率限制器定时清理
     */
    private _startRateLimiterCleanup;
    /**
     * 清理速率限制器过期记录
     */
    private _cleanupRateLimiter;
    /**
     * 设置 LLM 调用函数
     * @param fn LLM 调用函数
     */
    setLLMCallFunction(fn: LLMCallFunction): void;
    /**
     * 调度 LLM 调用
     * @param request 调度请求
     * @returns Promise<LLMScheduleResponse> 调度响应
     */
    schedule(request: LLMScheduleRequest): Promise<LLMScheduleResponse>;
    /**
     * 批量调度
     * @param requests 调度请求列表
     * @returns Promise<LLMScheduleResponse[]> 调度响应列表
     */
    scheduleBatch(requests: LLMScheduleRequest[]): Promise<LLMScheduleResponse[]>;
    /**
     * 获取调度器状态
     */
    getStatus(): {
        tokenPool: ReturnType<TokenPool['getStatus']>;
        scheduler: Record<string, number>;
    };
    /**
     * 获取统计信息
     */
    getStats(): Record<string, number>;
    /**
     * 获取令牌池统计
     */
    getTokenPoolStats(): ReturnType<TokenPool['getStats']>;
    private _callLLM;
    private _isRateLimited;
    private _recordRate;
    private _waitForRateLimit;
    private _delay;
    /**
     * 关闭调度器
     */
    close(): Promise<void>;
}
export default LLMScheduler;
//# sourceMappingURL=LLMScheduler.d.ts.map