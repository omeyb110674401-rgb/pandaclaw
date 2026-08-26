/**
 * PandaClaw UI - 模拟数据
 * 
 * 用于开发测试
 * 负责：前端专家 (cppcc-5)
 */

import type { Meeting } from '../types';

export const mockMeeting: Meeting = {
  id: 'meeting-001',
  version: 1,
  topic: '完善民主协商会议系统',
  type: 'project-planning',
  status: 'step5-deliberation',
  createdAt: Date.now() - 3600000,
  updatedAt: Date.now(),
  participants: {
    cppcc: [
      { id: 'cppcc-1', expertise: 'DevOps专家', stance: 'endorse' },
      { id: 'cppcc-2', expertise: '后端专家', stance: 'supplement' },
      { id: 'cppcc-3', expertise: '风险评估师', stance: 'independent' },
      { id: 'cppcc-4', expertise: '产品专家', stance: 'endorse' },
      { id: 'cppcc-5', expertise: '前端专家', stance: 'supplement' },
    ],
    npc: [
      { id: 'npc-1', expertise: '系统架构师' },
      { id: 'npc-2', expertise: 'AI工程师' },
      { id: 'npc-3', expertise: '质量监督员' },
      { id: 'npc-4', expertise: '可行性分析师' },
      { id: 'npc-5', expertise: '智能体编排者' },
    ],
    user: {
      name: '被窝睡神',
    },
  },
  context: {
    background: '使用会议系统来完善会议系统本身，实现自我改进。',
    history: [
      '2026-03-25: 系统架构设计完成',
      '2026-03-26: 身份系统实现',
      '2026-03-27: 消息队列集成',
    ],
    constraints: [
      '必须遵循七步闭环流程',
      'UI响应时间 < 100ms',
      '支持WebSocket实时同步',
    ],
    successCriteria: [
      '政协委员独立输出意见',
      '人大代表强制质询',
      '投票带理由',
      '决策文档生成',
    ],
  },
  decisions: [],
};

export const mockVotingMeeting: Meeting = {
  ...mockMeeting,
  id: 'meeting-002',
  status: 'step6-voting',
  participants: {
    ...mockMeeting.participants,
    npc: [
      { id: 'npc-1', expertise: '系统架构师', vote: 'approve' },
      { id: 'npc-2', expertise: 'AI工程师', vote: 'approve' },
      { id: 'npc-3', expertise: '质量监督员', vote: 'reject' },
      { id: 'npc-4', expertise: '可行性分析师', vote: 'approve' },
      { id: 'npc-5', expertise: '智能体编排者', vote: 'abstain' },
    ],
  },
  decisions: [
    {
      id: 'decision-001',
      content: '采用消息队列 + 事件驱动架构实现会议系统',
      rationale: '支持异步处理、水平扩展、解耦模块',
      timestamp: Date.now(),
      votes: [],
    },
  ],
};