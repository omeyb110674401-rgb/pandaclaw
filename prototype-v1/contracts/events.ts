/**
 * PandaClaw 事件契约
 * 
 * 负责人: cppcc-1（DevOps专家）
 * 版本: v1
 * 
 * BullMQ消息队列使用的事件定义
 */

import { MeetingEventType } from './api';

// ============================================
// 事件通道定义
// ============================================

export const EVENT_CHANNELS = {
  MEETING_EVENTS: 'pandaclaw:meeting:events',
  AGENT_EVENTS: 'pandaclaw:agent:events',
  SYSTEM_EVENTS: 'pandaclaw:system:events',
} as const;

// ============================================
// 事件数据结构
// ============================================

export interface BaseEvent {
  eventId: string;
  version: number;           // 契约版本号
  eventType: MeetingEventType;
  meetingId: string;
  timestamp: number;
  source: string;
  correlationId?: string;    // 用于追踪请求-响应链
}

export interface MeetingCreatedEvent extends BaseEvent {
  eventType: 'meeting:created';
  payload: {
    topic: string;
    type: string;
    context: Record<string, any>;
  };
}

export interface StepChangedEvent extends BaseEvent {
  eventType: 'step:changed';
  payload: {
    fromStep: number;
    toStep: number;
    reason: string;
  };
}

export interface OpinionSubmittedEvent extends BaseEvent {
  eventType: 'opinion:submitted';
  payload: {
    agentId: string;
    opinion: string;
    step: number;
  };
}

export interface StanceRecordedEvent extends BaseEvent {
  eventType: 'stance:recorded';
  payload: {
    agentId: string;
    stance: string;
    reason: string;
    targetOpinion?: string;
  };
}

export interface InquiryCreatedEvent extends BaseEvent {
  eventType: 'inquiry:created';
  payload: {
    inquirerId: string;
    questionId: string;
    question: string;
    category: string;
  };
}

export interface InquiryAnsweredEvent extends BaseEvent {
  eventType: 'inquiry:answered';
  payload: {
    questionId: string;
    responderId: string;
    answer: string;
  };
}

export interface VoteCastEvent extends BaseEvent {
  eventType: 'vote:cast';
  payload: {
    voterId: string;
    vote: string;
    reason: string;
  };
}

export interface DecisionMadeEvent extends BaseEvent {
  eventType: 'decision:made';
  payload: {
    decision: string;
    voteSummary: {
      approve: number;
      reject: number;
      abstain: number;
    };
    passed: boolean;
  };
}

// ============================================
// 事件联合类型
// ============================================

export type PandaClawEvent =
  | MeetingCreatedEvent
  | StepChangedEvent
  | OpinionSubmittedEvent
  | StanceRecordedEvent
  | InquiryCreatedEvent
  | InquiryAnsweredEvent
  | VoteCastEvent
  | DecisionMadeEvent;

// ============================================
// 死信队列事件
// ============================================

export interface DeadLetterEvent {
  originalEvent: PandaClawEvent;
  failureReason: string;
  retryCount: number;
  failedAt: number;
}

// ============================================
// 熔断器事件
// ============================================

export interface CircuitBreakerEvent {
  version: number;
  serviceId: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure?: {
    error: string;
    timestamp: number;
  };
}