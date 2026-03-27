/**
 * PandaClaw UI - 类型定义
 * 
 * 基于契约: contracts/api.ts
 * 负责：前端专家 (cppcc-5)
 */

// ============================================
// 会议相关类型
// ============================================

export interface Meeting {
  id: string;
  version: number;
  topic: string;
  type: MeetingType;
  status: MeetingStatus;
  createdAt: number;
  updatedAt: number;
  participants: Participants;
  context: MeetingContext;
  decisions: Decision[];
}

export type MeetingType =
  | 'project-planning'
  | 'proposal-review'
  | 'progress-check'
  | 'problem-solving'
  | 'final-acceptance'
  | 'emergency';

export type MeetingStatus =
  | 'pending'
  | 'step1-alignment'
  | 'step2-information'
  | 'step3-roles'
  | 'step4-coordination'
  | 'step5-deliberation'
  | 'step6-voting'
  | 'step7-decision'
  | 'completed'
  | 'cancelled';

export interface Participants {
  cppcc: AgentParticipant[];
  npc: AgentParticipant[];
  user?: UserParticipant;
}

export interface AgentParticipant {
  id: string;
  expertise: string;
  stance?: Stance;
  vote?: Vote;
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
  timestamp: number;
  votes: VoteRecord[];
}

export interface VoteRecord {
  voter: string;
  vote: Vote;
  reason: string;
  castAt: number;
}

// ============================================
// 状态管理类型
// ============================================

export interface StateSnapshot {
  meetingId: string;
  step: number;
  data: Record<string, unknown>;
  checksum: string;
  timestamp: number;
}

export interface AgentState {
  id: string;
  expertise: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  lastHeartbeat: number;
  currentStep?: number;
  opinion?: string;
  stance?: {
    type: string;
    reason: string;
    target?: string;
  };
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

// ============================================
// WebSocket 消息类型
// ============================================

export interface WSMessage {
  type: 'state:update' | 'meeting:event' | 'agent:status' | 'step:change';
  payload: unknown;
  timestamp: number;
}

// ============================================
// 步骤映射
// ============================================

export const STEP_LABELS: Record<string, string> = {
  'pending': '待开始',
  'step1-alignment': '目标对齐',
  'step2-information': '信息共享',
  'step3-roles': '角色分工',
  'step4-coordination': '协调机制',
  'step5-deliberation': '政协协商',
  'step6-voting': '人大表决',
  'step7-decision': '决策输出',
  'completed': '已完成',
  'cancelled': '已取消',
};

export const STANCE_LABELS: Record<Stance, string> = {
  endorse: '附议',
  supplement: '补充',
  oppose: '反对',
  independent: '独立',
};

export const VOTE_LABELS: Record<Vote, string> = {
  approve: '赞成',
  reject: '反对',
  abstain: '弃权',
};