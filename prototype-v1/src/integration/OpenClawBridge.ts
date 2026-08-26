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

/** 契约版本号 */
const CONTRACT_VERSION = 1;

/** OpenClaw API 配置 */
export const OPENCLAW_CONFIG = {
  baseUrl: 'http://localhost:3000',  // OpenClaw Gateway 地址
  timeout: 30000,                    // API 超时（毫秒）
  maxRetries: 3,                     // 最大重试次数
  retryDelay: 1000,                  // 重试延迟（毫秒）
} as const;

/** OpenClaw 消息格式 */
export interface OpenClawMessage {
  sessionKey: string;    // 目标 Session Key
  message: string;       // 消息内容
  timeoutSeconds?: number; // 超时秒数
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

/** 待处理响应 */
interface PendingResponse {
  correlationId: string;
  resolve: (response: any) => void;
  reject: (error: Error) => void;
  timeoutTimer: NodeJS.Timeout;
  timestamp: number;
}

/**
 * OpenClaw 桥接器
 * 
 * 注意：此模块在 OpenClaw Agent 内运行时，
 * 直接使用 sessions_send 工具，无需 HTTP 调用。
 */
export class OpenClawBridge extends EventEmitter {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;
  
  private pendingResponses: Map<string, PendingResponse> = new Map();
  private stats = {
    sentCount: 0,
    receivedCount: 0,
    errorCount: 0,
    retryCount: 0,
    totalLatency: 0,
    maxLatency: 0
  };
  
  // 在 OpenClaw 内部运行时，使用工具函数
  private sessionsSend?: (params: OpenClawMessage) => Promise<OpenClawResponse>;
  
  constructor(options: OpenClawBridgeOptions = {}) {
    super();
    
    this.baseUrl = options.baseUrl ?? OPENCLAW_CONFIG.baseUrl;
    this.timeout = options.timeout ?? OPENCLAW_CONFIG.timeout;
    this.maxRetries = options.maxRetries ?? OPENCLAW_CONFIG.maxRetries;
    this.retryDelay = options.retryDelay ?? OPENCLAW_CONFIG.retryDelay;
    
    console.log(`✅ OpenClawBridge 初始化完成 (契约 v${CONTRACT_VERSION})`);
    console.log(`   模式: 内部桥接（直接使用 sessions_send）`);
  }
  
  /**
   * 设置 sessions_send 函数（在 OpenClaw Agent 内调用）
   * @param fn sessions_send 工具函数
   */
  setSessionsSend(fn: (params: OpenClawMessage) => Promise<OpenClawResponse>): void {
    this.sessionsSend = fn;
    console.log('   sessions_send 已绑定');
  }
  
  /**
   * 发送消息到 OpenClaw Agent
   * @param targetSession 目标 Session Key (如 'agent:cppcc-1:main')
   * @param message 消息内容
   * @param options 可选配置
   */
  async send(
    targetSession: string,
    message: string,
    options: { timeoutSeconds?: number; correlationId?: string } = {}
  ): Promise<OpenClawResponse> {
    const correlationId = options.correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this._doSend(targetSession, message, {
          ...options,
          correlationId
        });
        
        // 更新统计
        const latency = Date.now() - startTime;
        this.stats.totalLatency += latency;
        if (latency > this.stats.maxLatency) {
          this.stats.maxLatency = latency;
        }
        this.stats.sentCount++;
        
        this.emit('sent', {
          targetSession,
          correlationId,
          latency,
          attempt
        });
        
        return response;
      } catch (error) {
        lastError = error as Error;
        this.stats.retryCount++;
        
        if (attempt < this.maxRetries) {
          await this._delay(this.retryDelay * Math.pow(2, attempt));
          this.emit('retry', { targetSession, attempt, error });
        }
      }
    }
    
    // 所有重试失败
    this.stats.errorCount++;
    this.emit('error', { targetSession, correlationId, error: lastError });
    
    return {
      success: false,
      error: {
        code: 'SEND_FAILED',
        message: lastError?.message || '发送失败'
      }
    };
  }
  
  /**
   * 广播消息到多个 Agent
   * @param sessions 目标 Session Keys
   * @param message 消息内容
   */
  async broadcast(
    sessions: string[],
    message: string,
    options: { timeoutSeconds?: number } = {}
  ): Promise<Map<string, OpenClawResponse>> {
    const results = new Map<string, OpenClawResponse>();
    
    // 并行发送
    const promises = sessions.map(async (session) => {
      const response = await this.send(session, message, options);
      results.set(session, response);
      return { session, response };
    });
    
    await Promise.all(promises);
    
    this.emit('broadcast', { sessions, successCount: results.size });
    return results;
  }
  
  /**
   * 等待响应
   * @param correlationId 关联ID
   * @param timeout 超时时间
   */
  async waitForResponse(correlationId: string, timeout?: number): Promise<any> {
    const timeoutMs = timeout ?? this.timeout;
    
    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new Error(`响应超时: ${correlationId}`));
      }, timeoutMs);
      
      this.pendingResponses.set(correlationId, {
        correlationId,
        resolve,
        reject,
        timeoutTimer,
        timestamp: Date.now()
      });
    });
  }
  
  /**
   * 处理接收到的响应（由 inter_session 触发）
   * @param response 响应消息
   */
  handleResponse(response: { correlationId?: string } & Record<string, any>): void {
    if (!response.correlationId) {
      this.emit('unmatched', response);
      return;
    }
    
    const pending = this.pendingResponses.get(response.correlationId);
    if (pending) {
      clearTimeout(pending.timeoutTimer);
      this.pendingResponses.delete(response.correlationId);
      
      this.stats.receivedCount++;
      this.emit('response', { correlationId: response.correlationId, response });
      
      pending.resolve(response);
    } else {
      this.emit('unmatched', response);
    }
  }
  
  /**
   * 转换 PandaClaw 消息为 OpenClaw 格式
   * @param pandaclawMessage PandaClaw 消息对象
   */
  convertToOpenClawFormat(pandaclawMessage: {
    to: string;
    payload: { content: string; data?: Record<string, any> };
    metadata?: Record<string, any>;
  }): OpenClawMessage {
    const sessionKey = `agent:${pandaclawMessage.to}:main`;
    
    // 构建消息内容
    let messageContent = pandaclawMessage.payload.content;
    
    // 如果有额外数据，附加到消息
    if (pandaclawMessage.payload.data) {
      const dataStr = JSON.stringify(pandaclawMessage.payload.data, null, 2);
      messageContent += `\n\n【附加数据】\n${dataStr}`;
    }
    
    // 如果有元数据，附加到消息
    if (pandaclawMessage.metadata) {
      const metaStr = JSON.stringify(pandaclawMessage.metadata, null, 2);
      messageContent += `\n\n【元数据】\n${metaStr}`;
    }
    
    return {
      sessionKey,
      message: messageContent,
      timeoutSeconds: 0  // 避免双响应
    };
  }
  
  /**
   * 获取统计信息
   */
  getStats(): Record<string, number> {
    const avgLatency = this.stats.sentCount > 0
      ? Math.round(this.stats.totalLatency / this.stats.sentCount)
      : 0;
    
    return {
      ...this.stats,
      avgLatency,
      pendingCount: this.pendingResponses.size
    };
  }
  
  // ==================== 内部方法 ====================
  
  private async _doSend(
    targetSession: string,
    message: string,
    options: { timeoutSeconds?: number; correlationId?: string }
  ): Promise<OpenClawResponse> {
    // 在 OpenClaw Agent 内，直接使用 sessions_send
    if (this.sessionsSend) {
      const result = await this.sessionsSend({
        sessionKey: targetSession,
        message,
        timeoutSeconds: options.timeoutSeconds ?? 0
      });
      
      return result as OpenClawResponse;
    }
    
    // 外部模式：HTTP 调用（备用）
    throw new Error('外部 HTTP 模式未实现，请在 OpenClaw Agent 内运行');
  }
  
  private async _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 关闭桥接器
   */
  async close(): Promise<void> {
    // 清理待处理响应
    for (const [correlationId, pending] of this.pendingResponses) {
      clearTimeout(pending.timeoutTimer);
      pending.reject(new Error('OpenClawBridge 已关闭'));
    }
    this.pendingResponses.clear();
    
    this.removeAllListeners();
    console.log('✅ OpenClawBridge 已关闭');
  }
}

export default OpenClawBridge;