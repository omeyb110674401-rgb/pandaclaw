/**
 * OpenClawBridge - OpenClaw桥接（符合契约 v1）
 * @author npc-2 (AI工程师)
 * @version 1.0.0
 * @contract contracts/messages.ts
 *
 * 功能：
 * - 对接 sessions_send API
 * - 消息格式转换
 * - 错误处理与重试
 * - 响应追踪
 */
import { EventEmitter } from 'events';
/** OpenClaw API 配置 */
export declare const OPENCLAW_CONFIG: {
    readonly baseUrl: "http://localhost:3000";
    readonly timeout: 30000;
    readonly maxRetries: 3;
    readonly retryDelay: 1000;
};
/** OpenClaw 消息格式 */
export interface OpenClawMessage {
    sessionKey: string;
    message: string;
    timeoutSeconds?: number;
}
/** OpenClaw 响应格式 */
export interface OpenClawResponse {
    success: boolean;
    messageId?: string;
    error?: {
        code: string;
        message: string;
    };
}
/** 桥接配置 */
export interface OpenClawBridgeOptions {
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
}
/**
 * OpenClaw 桥接器
 *
 * 注意：此模块在 OpenClaw Agent 内运行时，
 * 直接使用 sessions_send 工具，无需 HTTP 调用。
 */
export declare class OpenClawBridge extends EventEmitter {
    private baseUrl;
    private timeout;
    private maxRetries;
    private retryDelay;
    private pendingResponses;
    private stats;
    private sessionsSend?;
    constructor(options?: OpenClawBridgeOptions);
    /**
     * 设置 sessions_send 函数（在 OpenClaw Agent 内调用）
     * @param fn sessions_send 工具函数
     */
    setSessionsSend(fn: (params: OpenClawMessage) => Promise<OpenClawResponse>): void;
    /**
     * 发送消息到 OpenClaw Agent
     * @param targetSession 目标 Session Key (如 'agent:cppcc-1:main')
     * @param message 消息内容
     * @param options 可选配置
     */
    send(targetSession: string, message: string, options?: {
        timeoutSeconds?: number;
        correlationId?: string;
    }): Promise<OpenClawResponse>;
    /**
     * 广播消息到多个 Agent
     * @param sessions 目标 Session Keys
     * @param message 消息内容
     */
    broadcast(sessions: string[], message: string, options?: {
        timeoutSeconds?: number;
    }): Promise<Map<string, OpenClawResponse>>;
    /**
     * 等待响应
     * @param correlationId 关联ID
     * @param timeout 超时时间
     */
    waitForResponse(correlationId: string, timeout?: number): Promise<any>;
    /**
     * 处理接收到的响应（由 inter_session 触发）
     * @param response 响应消息
     */
    handleResponse(response: {
        correlationId?: string;
    } & Record<string, any>): void;
    /**
     * 转换 PandaClaw 消息为 OpenClaw 格式
     * @param pandaclawMessage PandaClaw 消息对象
     */
    convertToOpenClawFormat(pandaclawMessage: {
        to: string;
        payload: {
            content: string;
            data?: Record<string, any>;
        };
        metadata?: Record<string, any>;
    }): OpenClawMessage;
    /**
     * 获取统计信息
     */
    getStats(): Record<string, number>;
    private _doSend;
    private _delay;
    /**
     * 关闭桥接器
     */
    close(): Promise<void>;
}
export default OpenClawBridge;
//# sourceMappingURL=OpenClawBridge.d.ts.map