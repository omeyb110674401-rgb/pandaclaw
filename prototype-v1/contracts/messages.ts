/**
 * PandaClaw 消息契约
 * 
 * 负责人: cppcc-2（后端专家）
 * 版本: v1
 * 
 * OpenClaw消息适配器使用的消息格式
 */

// ============================================
// 消息队列配置
// ============================================

export const QUEUE_CONFIG = {
  // BullMQ队列名称
  QUEUES: {
    SEND_QUEUE: 'pandaclaw:send',
    RECEIVE_QUEUE: 'pandaclaw:receive',
    DEAD_LETTER_QUEUE: 'pandaclaw:dead-letter',
  },
  
  // Redis连接配置
  REDIS: {
    host: 'localhost',
    port: 6379,
    db: 0,
  },
  
  // 消息TTL（毫秒）
  MESSAGE_TTL: 24 * 60 * 60 * 1000, // 24小时
  
  // 重试配置
  RETRY: {
    maxRetries: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
} as const;

// ============================================
// 消息类型定义
// ============================================

export interface QueuedMessage {
  id: string;                  // 消息唯一ID
  version: number;             // 契约版本号
  correlationId: string;       // 关联ID（用于响应追踪）
  meetingId: string;           // 会议ID
  from: string;                // 发送者Agent ID
  to: string;                  // 接收者Agent ID 或 'all'
  type: MessageType;
  priority: MessagePriority;
  payload: MessagePayload;
  metadata: MessageMetadata;
  createdAt: number;
  expiresAt: number;
}

export type MessageType =
  // 步骤通知
  | 'step:notification'
  // 意见类
  | 'opinion:submit'
  | 'opinion:broadcast'
  // 立场类
  | 'stance:record'
  | 'stance:summary'
  // 质询类
  | 'inquiry:create'
  | 'inquiry:answer'
  | 'inquiry:summary'
  // 投票类
  | 'vote:cast'
  | 'vote:summary'
  // 决策类
  | 'decision:make'
  | 'decision:announce';

export type MessagePriority = 'high' | 'normal' | 'low';

export interface MessagePayload {
  content: string;
  data?: Record<string, any>;
}

export interface MessageMetadata {
  step: number;
  requiresResponse: boolean;
  timeout?: number;            // 超时时间（毫秒）
  retryCount: number;
}

// ============================================
// 响应消息
// ============================================

export interface ResponseMessage {
  id: string;
  correlationId: string;       // 对应请求的ID
  status: 'success' | 'error' | 'timeout';
  payload: MessagePayload;
  from: string;
  respondedAt: number;
}

// ============================================
// 快速通道消息（进程内）
// ============================================

export type FastPathMessageType = 
  | 'step:notification'
  | 'agent:invoke'
  | 'state:get'
  | 'state:set'
  | 'heartbeat';

export interface FastPathMessage<T = unknown> {
  id: string;
  type: FastPathMessageType;
  payload: T;
  callback?: (response: unknown) => void;
}

// ============================================
// 消息适配器接口
// ============================================

export interface MessageAdapter {
  // 发送消息
  send(message: QueuedMessage): Promise<string>;
  
  // 广播消息
  broadcast(meetingId: string, message: Omit<QueuedMessage, 'to'>): Promise<string>;
  
  // 等待响应
  waitForResponse(correlationId: string, timeout: number): Promise<ResponseMessage>;
  
  // 订阅消息
  subscribe(agentId: string, handler: (message: QueuedMessage) => Promise<void>): void;
  
  // 确认消息（ACK）
  ack(messageId: string): Promise<void>;
}

// ============================================
// 令牌池配置（LLM并发控制）
// ============================================

export const TOKEN_POOL_CONFIG = {
  maxSize: 10,                 // 最大令牌数
  acquireTimeout: 30000,       // 获取令牌超时（毫秒）
  priorityLevels: 3,           // 优先级级别
} as const;

export interface TokenPoolStatus {
  available: number;
  waiting: number;
  total: number;
}