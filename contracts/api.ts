/**
 * PandaClaw API 接口契约
 * 
 * 负责人: npc-1（系统架构师）
 * 版本: v1
 * 更新时间: 2026-03-27
 * 
 * 所有模块必须基于此契约开发
 */

import { ErrorCode } from './state';

// ============================================
// 会议相关接口
// ============================================

export interface Meeting {
  id: string;
  version: number;           // 契约版本号，用于兼容性检查
  topic: string;
  type: MeetingType;
  status: MeetingStatus;
  createdAt: number;         // 时间戳（毫秒）
  updatedAt: number;         // 时间戳（毫秒）
  participants: Participants;
  context: MeetingContext;
  decisions: Decision[];
}

export type MeetingType = 
  | 'project-planning'      // 项目规划
  | 'proposal-review'       // 提案审议
  | 'progress-check'        // 进度检查
  | 'problem-solving'       // 问题解决
  | 'final-acceptance'      // 最终验收
  | 'emergency';            // 紧急会议

export type MeetingStatus =
  | 'pending'               // 待开始
  | 'step1-alignment'       // 步骤1：目标对齐
  | 'step2-information'     // 步骤2：信息共享
  | 'step3-roles'           // 步骤3：角色分工
  | 'step4-coordination'    // 步骤4：协调机制
  | 'step5-deliberation'    // 步骤5：政协协商
  | 'step6-voting'          // 步骤6：人大表决
  | 'step7-decision'        // 步骤7：决策输出
  | 'completed'             // 已完成
  | 'cancelled';            // 已取消

export interface Participants {
  cppcc: AgentParticipant[];
  npc: AgentParticipant[];
  user?: UserParticipant;
}

export interface AgentParticipant {
  id: string;               // 如 'cppcc-1'
  expertise: string;        // 专业身份
  stance?: Stance;          // 立场（政协）
  vote?: Vote;              // 投票（人大）
}

export interface UserParticipant {
  name: string;
  decision?: string;
}

export type Stance = 'endorse' | 'supplement' | 'oppose' | 'independent';

export type Vote = 'approve' | 'reject' | 'abstain';

export interface MeetingContext {
  background: string;
  history: string[];
  constraints: string[];
  successCriteria: string[];
}

export interface Decision {
  id: string;
  content: string;
  rationale: string;
  timestamp: number;        // 时间戳（毫秒）
  votes: VoteRecord[];
}

export interface VoteRecord {
  voter: string;
  vote: Vote;
  reason: string;
  castAt: number;           // 时间戳（毫秒）
}

// ============================================
// 消息相关接口
// ============================================

export interface Message {
  id: string;
  version: number;           // 契约版本号
  meetingId: string;
  from: string;             // Agent ID
  to: string | 'all';       // Agent ID 或 'all'
  type: MessageType;
  content: MessageContent;
  timestamp: number;        // 时间戳（毫秒）
}

export type MessageType =
  | 'step-notification'     // 步骤通知
  | 'opinion'               // 意见
  | 'stance'                // 立场标记
  | 'inquiry'               // 质询
  | 'response'              // 回应
  | 'vote'                  // 投票
  | 'decision';             // 决策

export interface MessageContent {
  text?: string;
  data?: Record<string, any>;
}

// ============================================
// 状态管理接口
// ============================================

export interface StateSnapshot {
  meetingId: string;
  step: number;
  data: Record<string, any>;
  checksum: string;
  timestamp: number;        // 时间戳（毫秒）
}

export interface Checkpoint {
  id: string;
  meetingId: string;
  snapshot: StateSnapshot;
  createdAt: number;        // 时间戳（毫秒）
}

// ============================================
// Agent协调接口
// ============================================

export interface AgentStatus {
  id: string;
  expertise: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  lastHeartbeat: number;    // 时间戳（毫秒）
  currentTask?: string;
}

export interface TaskAssignment {
  taskId: string;
  meetingId: string;
  agentId: string;
  task: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  deadline?: number;        // 时间戳（毫秒）
}

// ============================================
// API响应格式
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;        // 使用预定义的错误码枚举
    message: string;
    details?: Record<string, any>;
  };
  timestamp: number;        // 时间戳（毫秒）
}

// ============================================
// 事件定义（供事件驱动使用）
// ============================================

export interface MeetingEvent {
  version: number;          // 契约版本号
  type: MeetingEventType;
  meetingId: string;
  payload: any;
  timestamp: number;        // 时间戳（毫秒）
  source: string;
}

export type MeetingEventType =
  | 'meeting:created'
  | 'meeting:started'
  | 'step:changed'
  | 'opinion:submitted'
  | 'stance:recorded'
  | 'inquiry:created'
  | 'inquiry:answered'
  | 'vote:cast'
  | 'decision:made'
  | 'meeting:completed';

// ============================================
// 健康检查接口
// ============================================

export interface HealthCheckRequest {
  agentId: string;
  timestamp: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;            // 运行时间（毫秒）
  lastError?: {
    code: ErrorCode;
    message: string;
    timestamp: number;
  };
  metrics: {
    messagesProcessed: number;
    averageLatency: number;   // 平均延迟（毫秒）
    errorRate: number;        // 错误率（百分比）
  };
}

export interface HeartbeatRequest {
  agentId: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  currentTask?: string;
  timestamp: number;
}

export interface HeartbeatResponse {
  acknowledged: boolean;
  serverTime: number;
  nextHeartbeatDue: number;  // 下次心跳时间（毫秒）
}