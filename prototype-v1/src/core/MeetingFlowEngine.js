/**
 * MeetingFlowEngine - 会议流程引擎（符合契约 v1）
 * @author cppcc-2 (后端专家)
 * @version 2.0.0 - 契约合规版
 * @contract contracts/api.ts
 * 
 * 功能：
 * - 七步闭环流程编排
 * - 状态转换符合 MeetingStatus
 * - 事件发送符合 MeetingEvent
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/** 契约版本号 */
const CONTRACT_VERSION = 1;

/** 会议状态枚举（符合 MeetingStatus） */
const MeetingStatus = {
  PENDING: 'pending',
  STEP1_ALIGNMENT: 'step1-alignment',
  STEP2_INFORMATION: 'step2-information',
  STEP3_ROLES: 'step3-roles',
  STEP4_COORDINATION: 'step4-coordination',
  STEP5_DELIBERATION: 'step5-deliberation',
  STEP6_VOTING: 'step6-voting',
  STEP7_DECISION: 'step7-decision',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/** 事件类型枚举（符合 MeetingEventType） */
const MeetingEventType = {
  CREATED: 'meeting:created',
  STARTED: 'meeting:started',
  STEP_CHANGED: 'step:changed',
  OPINION_SUBMITTED: 'opinion:submitted',
  STANCE_RECORDED: 'stance:recorded',
  INQUIRY_CREATED: 'inquiry:created',
  INQUIRY_ANSWERED: 'inquiry:answered',
  VOTE_CAST: 'vote:cast',
  DECISION_MADE: 'decision:made',
  COMPLETED: 'meeting:completed'
};

class MeetingFlowEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.stateManager = options.stateManager;
    this.messageAdapter = options.messageAdapter;
    this.agentCoordinator = options.agentCoordinator;
    
    this.activeMeetings = new Map();
    this.stats = {
      totalMeetings: 0,
      activeMeetings: 0,
      completedMeetings: 0,
      errorMeetings: 0
    };
  }
  
  // ==================== 会议生命周期 ====================
  
  /**
   * 创建会议（符合 Meeting 接口）
   * @param {Object} config 会议配置
   * @returns {Promise<{meetingId: string, meeting: Meeting}>}
   */
  async createMeeting(config) {
    const meetingId = config.id || uuidv4();
    const now = Date.now();
    
    const meeting = {
      id: meetingId,
      version: CONTRACT_VERSION,
      topic: config.topic,
      type: config.type || 'proposal-review',
      status: MeetingStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      participants: config.participants || { cppcc: [], npc: [] },
      context: config.context || {
        background: '',
        history: [],
        constraints: [],
        successCriteria: []
      },
      decisions: [],
      
      // 内部状态
      _currentStep: 0,
      _opinions: {},
      _stances: {},
      _inquiries: {},
      _votes: {}
    };
    
    // 持久化
    if (this.stateManager) {
      this.stateManager.createMeeting(meeting);
    }
    
    this.activeMeetings.set(meetingId, meeting);
    this.stats.totalMeetings++;
    this.stats.activeMeetings++;
    
    // 发送事件
    this._emitEvent(MeetingEventType.CREATED, meetingId, {
      topic: meeting.topic,
      type: meeting.type,
      context: meeting.context
    });
    
    return { meetingId, meeting };
  }
  
  /**
   * 开始会议
   * @param {string} meetingId 会议ID
   */
  async startMeeting(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    if (meeting.status !== MeetingStatus.PENDING) {
      throw new Error(`会议状态不允许启动: ${meeting.status}`);
    }
    
    // 进入步骤1
    return this._advanceStep(meetingId, MeetingStatus.STEP1_ALIGNMENT);
  }
  
  /**
   * 推进到下一步
   * @param {string} meetingId 会议ID
   */
  async nextStep(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    const stepOrder = [
      MeetingStatus.STEP1_ALIGNMENT,
      MeetingStatus.STEP2_INFORMATION,
      MeetingStatus.STEP3_ROLES,
      MeetingStatus.STEP4_COORDINATION,
      MeetingStatus.STEP5_DELIBERATION,
      MeetingStatus.STEP6_VOTING,
      MeetingStatus.STEP7_DECISION,
      MeetingStatus.COMPLETED
    ];
    
    const currentIndex = stepOrder.indexOf(meeting.status);
    if (currentIndex < 0 || currentIndex >= stepOrder.length - 1) {
      throw new Error(`无法推进: ${meeting.status}`);
    }
    
    const nextStatus = stepOrder[currentIndex + 1];
    return this._advanceStep(meetingId, nextStatus);
  }
  
  /**
   * 内部：推进步骤
   */
  async _advanceStep(meetingId, newStatus) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    const previousStatus = meeting.status;
    meeting.status = newStatus;
    meeting.updatedAt = Date.now();
    meeting._currentStep = this._statusToStep(newStatus);
    
    // 更新持久化
    if (this.stateManager) {
      this.stateManager.updateMeetingStatus(meetingId, newStatus);
      
      // 创建快照
      this.stateManager.createSnapshot(meetingId, meeting._currentStep, {
        status: newStatus,
        opinions: meeting._opinions,
        votes: meeting._votes
      });
    }
    
    // 发送事件
    this._emitEvent(MeetingEventType.STEP_CHANGED, meetingId, {
      fromStep: this._statusToStep(previousStatus),
      toStep: meeting._currentStep,
      reason: '正常推进'
    });
    
    // 如果完成
    if (newStatus === MeetingStatus.COMPLETED) {
      this.stats.completedMeetings++;
      this.stats.activeMeetings--;
      
      this._emitEvent(MeetingEventType.COMPLETED, meetingId, {
        decisions: meeting.decisions
      });
    }
    
    return {
      meetingId,
      status: newStatus,
      step: meeting._currentStep
    };
  }
  
  // ==================== 步骤操作 ====================
  
  /**
   * 提交意见（步骤5）
   * @param {string} meetingId 会议ID
   * @param {string} agentId Agent ID
   * @param {string} opinion 意见内容
   */
  async submitOpinion(meetingId, agentId, opinion) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    if (meeting.status !== MeetingStatus.STEP5_DELIBERATION) {
      throw new Error(`当前步骤不允许提交意见: ${meeting.status}`);
    }
    
    meeting._opinions[agentId] = {
      agentId,
      opinion,
      timestamp: Date.now()
    };
    
    // 发送事件
    this._emitEvent(MeetingEventType.OPINION_SUBMITTED, meetingId, {
      agentId,
      opinion,
      step: 5
    });
    
    return { success: true, recorded: true };
  }
  
  /**
   * 记录立场（步骤5-2）
   * @param {string} meetingId 会议ID
   * @param {string} agentId Agent ID
   * @param {Stance} stance 立场
   * @param {string} reason 理由
   */
  async recordStance(meetingId, agentId, stance, reason) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    const validStances = ['endorse', 'supplement', 'oppose', 'independent'];
    if (!validStances.includes(stance)) {
      throw new Error(`无效立场: ${stance}`);
    }
    
    meeting._stances[agentId] = {
      agentId,
      stance,
      reason,
      timestamp: Date.now()
    };
    
    // 更新 participants
    const participant = meeting.participants.cppcc.find(p => p.id === agentId);
    if (participant) {
      participant.stance = stance;
    }
    
    this._emitEvent(MeetingEventType.STANCE_RECORDED, meetingId, {
      agentId,
      stance,
      reason
    });
    
    return { success: true };
  }
  
  /**
   * 投票（步骤6）
   * @param {string} meetingId 会议ID
   * @param {string} agentId Agent ID
   * @param {Vote} vote 投票
   * @param {string} reason 理由
   */
  async castVote(meetingId, agentId, vote, reason) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    if (meeting.status !== MeetingStatus.STEP6_VOTING) {
      throw new Error(`当前步骤不允许投票: ${meeting.status}`);
    }
    
    const validVotes = ['approve', 'reject', 'abstain'];
    if (!validVotes.includes(vote)) {
      throw new Error(`无效投票: ${vote}`);
    }
    
    meeting._votes[agentId] = {
      voter: agentId,
      vote,
      reason,
      castAt: Date.now()
    };
    
    // 更新 participants
    const participant = meeting.participants.npc.find(p => p.id === agentId);
    if (participant) {
      participant.vote = vote;
    }
    
    this._emitEvent(MeetingEventType.VOTE_CAST, meetingId, {
      voterId: agentId,
      vote,
      reason
    });
    
    return { success: true };
  }
  
  /**
   * 做出决策（步骤7）
   * @param {string} meetingId 会议ID
   * @param {string} content 决策内容
   * @param {string} rationale 理由
   */
  async makeDecision(meetingId, content, rationale) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) throw new Error(`会议不存在: ${meetingId}`);
    
    if (meeting.status !== MeetingStatus.STEP7_DECISION) {
      throw new Error(`当前步骤不允许决策: ${meeting.status}`);
    }
    
    // 统计投票
    const votes = Object.values(meeting._votes);
    const voteSummary = {
      approve: votes.filter(v => v.vote === 'approve').length,
      reject: votes.filter(v => v.vote === 'reject').length,
      abstain: votes.filter(v => v.vote === 'abstain').length
    };
    
    const passed = voteSummary.approve > voteSummary.reject;
    
    const decision = {
      id: uuidv4(),
      content,
      rationale,
      timestamp: Date.now(),
      votes: Object.values(meeting._votes)
    };
    
    meeting.decisions.push(decision);
    
    if (this.stateManager) {
      this.stateManager.recordDecision(meetingId, decision);
    }
    
    this._emitEvent(MeetingEventType.DECISION_MADE, meetingId, {
      decision: content,
      voteSummary,
      passed
    });
    
    // 进入完成状态
    await this._advanceStep(meetingId, MeetingStatus.COMPLETED);
    
    return {
      decision,
      voteSummary,
      passed
    };
  }
  
  // ==================== 工具方法 ====================
  
  _statusToStep(status) {
    const stepMap = {
      'pending': 0,
      'step1-alignment': 1,
      'step2-information': 2,
      'step3-roles': 3,
      'step4-coordination': 4,
      'step5-deliberation': 5,
      'step6-voting': 6,
      'step7-decision': 7,
      'completed': 8,
      'cancelled': -1
    };
    return stepMap[status] || 0;
  }
  
  _emitEvent(eventType, meetingId, payload) {
    const event = {
      eventId: uuidv4(),
      version: CONTRACT_VERSION,
      eventType,
      meetingId,
      payload,
      timestamp: Date.now(),
      source: 'MeetingFlowEngine'
    };
    
    this.emit('event', event);
    
    if (this.messageAdapter) {
      this.messageAdapter.broadcast(meetingId, {
        type: 'step:notification',
        from: 'MeetingFlowEngine',
        payload: event
      }).catch(err => console.error('事件发送失败:', err));
    }
  }
  
  /**
   * 获取会议状态
   */
  getMeeting(meetingId) {
    return this.activeMeetings.get(meetingId);
  }
  
  /**
   * 获取进度
   */
  getProgress(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) return null;
    
    return {
      meetingId,
      status: meeting.status,
      step: meeting._currentStep,
      totalSteps: 7,
      percentage: Math.round((meeting._currentStep / 7) * 100),
      decisions: meeting.decisions.length
    };
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeMeetingsList: Array.from(this.activeMeetings.keys())
    };
  }
}

module.exports = {
  MeetingFlowEngine,
  MeetingStatus,
  MeetingEventType,
  CONTRACT_VERSION
};