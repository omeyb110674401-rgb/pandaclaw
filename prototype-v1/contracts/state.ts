/**
 * PandaClaw 状态契约
 * 
 * 责责人: npc-1（系统架构师）
 * 版本: v1
 * 
 * SQLite状态存储使用的类型定义
 */

// ============================================
// 会议状态
// ============================================

export interface MeetingState {
  id: string;
  version: number;              // 契约版本
  meeting: MeetingData;
  stepState: StepState[];
  agentStates: AgentStateMap;
  lastModified: number;         // 时间戳（毫秒）
  checksum: string;             // 状态校验和
}

export interface MeetingData {
  topic: string;
  type: string;
  status: string;
  context: {
    background: string;
    history: string[];
    constraints: string[];
    successCriteria: string[];
  };
  createdAt: number;
  updatedAt: number;
}

export interface StepState {
  step: number;
  status: 'pending' | 'active' | 'completed';
  startedAt?: number;
  completedAt?: number;
  data: Record<string, any>;
}

export type AgentStateMap = Record<string, AgentState>;

export interface AgentState {
  id: string;
  expertise: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  lastHeartbeat: number;
  currentStep?: number;
  
  // 政协专用
  opinion?: string;
  stance?: {
    type: string;
    reason: string;
    target?: string;
  };
  
  // 人大专用
  inquiries?: InquiryRecord[];
  vote?: VoteRecord;
}

export interface InquiryRecord {
  id: string;
  question: string;
  category: string;
  answer?: string;
  answeredBy?: string;
  answeredAt?: number;
}

export interface VoteRecord {
  vote: 'approve' | 'reject' | 'abstain';
  reason: string;
  castAt: number;
}

// ============================================
// 状态快照（用于崩溃恢复）
// ============================================

export interface StateSnapshot {
  meetingId: string;
  version: number;
  step: number;
  state: MeetingState;
  checksum: string;
  createdAt: number;
}

export interface CheckpointRecord {
  id: string;
  meetingId: string;
  snapshot: StateSnapshot;
  type: 'auto' | 'manual' | 'step-boundary';
  createdAt: number;
}

// ============================================
// 状态操作接口
// ============================================

export interface StateOperation {
  type: 'create' | 'update' | 'delete' | 'snapshot';
  meetingId: string;
  payload: any;
  timestamp: number;
}

export interface StateStore {
  // 获取状态
  get(meetingId: string): Promise<MeetingState | null>;
  
  // 设置状态
  set(state: MeetingState): Promise<void>;
  
  // 创建快照
  createSnapshot(meetingId: string, type: string): Promise<StateSnapshot>;
  
  // 从快照恢复
  restore(snapshotId: string): Promise<MeetingState>;
  
  // 获取最近快照列表
  listSnapshots(meetingId: string, limit?: number): Promise<CheckpointRecord[]>;
}

// ============================================
// 状态变更事件
// ============================================

export interface StateChangeEvent {
  type: 'state:created' | 'state:updated' | 'state:restored' | 'state:deleted';
  meetingId: string;
  previousState?: MeetingState;
  newState: MeetingState;
  changedFields: string[];
  timestamp: number;
}

// ============================================
// 错误码枚举
// ============================================

export enum ErrorCode {
  // 会议相关
  MEETING_NOT_FOUND = 'MEETING_NOT_FOUND',
  MEETING_ALREADY_EXISTS = 'MEETING_ALREADY_EXISTS',
  MEETING_INVALID_STATUS = 'MEETING_INVALID_STATUS',
  MEETING_STEP_INVALID = 'MEETING_STEP_INVALID',
  
  // 状态相关
  STATE_CORRUPTED = 'STATE_CORRUPTED',
  STATE_VERSION_MISMATCH = 'STATE_VERSION_MISMATCH',
  STATE_CHECKSUM_FAILED = 'STATE_CHECKSUM_FAILED',
  
  // Agent相关
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_NOT_ACTIVE = 'AGENT_NOT_ACTIVE',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  
  // 消息相关
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_TIMEOUT = 'MESSAGE_TIMEOUT',
  MESSAGE_INVALID_FORMAT = 'MESSAGE_INVALID_FORMAT',
  
  // 系统相关
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
}