/**
 * PandaClaw UI - Zustand 状态管理
 * 
 * 负责：前端专家 (cppcc-5)
 * 验收标准：UI响应时间 < 100ms
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Meeting, StateSnapshot, AgentState } from '../types';

interface MeetingState {
  // 状态
  currentMeeting: Meeting | null;
  stateSnapshot: StateSnapshot | null;
  agentStates: Record<string, AgentState>;
  isConnected: boolean;
  lastUpdated: number;
  
  // 操作
  setMeeting: (meeting: Meeting | null) => void;
  updateMeeting: (updates: Partial<Meeting>) => void;
  setStateSnapshot: (snapshot: StateSnapshot) => void;
  updateAgentState: (agentId: string, state: Partial<AgentState>) => void;
  setConnected: (connected: boolean) => void;
  
  // 计算属性
  getCurrentStep: () => number;
  getParticipantsByRole: (role: 'cppcc' | 'npc') => AgentState[];
  getVoteResult: () => { approve: number; reject: number; abstain: number };
}

export const useMeetingStore = create<MeetingState>()(
  immer((set, get) => ({
    // 初始状态
    currentMeeting: null,
    stateSnapshot: null,
    agentStates: {},
    isConnected: false,
    lastUpdated: Date.now(),
    
    // 设置会议
    setMeeting: (meeting) =>
      set((state) => {
        state.currentMeeting = meeting;
        state.lastUpdated = Date.now();
      }),
    
    // 更新会议（局部更新）
    updateMeeting: (updates) =>
      set((state) => {
        if (state.currentMeeting) {
          Object.assign(state.currentMeeting, updates);
          state.currentMeeting.updatedAt = Date.now();
          state.lastUpdated = Date.now();
        }
      }),
    
    // 设置状态快照
    setStateSnapshot: (snapshot) =>
      set((state) => {
        state.stateSnapshot = snapshot;
        state.lastUpdated = Date.now();
      }),
    
    // 更新 Agent 状态
    updateAgentState: (agentId, agentState) =>
      set((state) => {
        state.agentStates[agentId] = {
          ...state.agentStates[agentId],
          ...agentState,
        } as AgentState;
        state.lastUpdated = Date.now();
      }),
    
    // 设置连接状态
    setConnected: (connected) =>
      set((state) => {
        state.isConnected = connected;
      }),
    
    // 获取当前步骤
    getCurrentStep: () => {
      const { currentMeeting } = get();
      if (!currentMeeting) return 0;
      
      const stepMap: Record<string, number> = {
        'pending': 0,
        'step1-alignment': 1,
        'step2-information': 2,
        'step3-roles': 3,
        'step4-coordination': 4,
        'step5-deliberation': 5,
        'step6-voting': 6,
        'step7-decision': 7,
        'completed': 8,
      };
      
      return stepMap[currentMeeting.status] || 0;
    },
    
    // 按角色获取参与者
    getParticipantsByRole: (role) => {
      const { currentMeeting, agentStates } = get();
      if (!currentMeeting) return [];
      
      const participants = currentMeeting.participants[role];
      return participants.map((p) => ({
        ...agentStates[p.id],
        id: p.id,
        expertise: p.expertise,
      }));
    },
    
    // 获取投票结果
    getVoteResult: () => {
      const { currentMeeting } = get();
      const result = { approve: 0, reject: 0, abstain: 0 };
      
      if (!currentMeeting) return result;
      
      currentMeeting.participants.npc.forEach((p) => {
        if (p.vote) {
          result[p.vote]++;
        }
      });
      
      return result;
    },
  }))
);