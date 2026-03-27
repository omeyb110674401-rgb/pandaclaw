/**
 * MeetingFlowEngine - 会议流程引擎
 * @author cppcc-2 (后端专家)
 * @version 1.0.0
 * 
 * 功能：
 * - 会议流程编排
 * - 阶段执行调度
 * - 状态同步
 * - 错误恢复
 * 
 * 验收标准：
 * - 流程执行可靠性 100%
 * - 状态一致性保证
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

// 导入流程配置
const {
  getFlowConfig,
  CONSULTATION_FLOW,
  STRATEGIC_FLOW,
  RESOLUTION_FLOW
} = require('../meeting-flow-independent');

/**
 * 会议流程引擎
 */
class MeetingFlowEngine extends EventEmitter {
  /**
   * 创建流程引擎
   * @param {Object} options 配置选项
   * @param {Object} options.stateManager 状态管理器
   * @param {Object} options.messageAdapter 消息适配器
   * @param {Object} options.agentCoordinator Agent协调器
   */
  constructor(options = {}) {
    super();
    
    this.stateManager = options.stateManager;
    this.messageAdapter = options.messageAdapter;
    this.agentCoordinator = options.agentCoordinator;
    
    // 活跃会议映射
    this.activeMeetings = new Map();
    
    // 阶段执行器映射
    this.stageExecutors = new Map();
    
    // 统计信息
    this.stats = {
      totalMeetings: 0,
      activeMeetings: 0,
      completedMeetings: 0,
      errorMeetings: 0
    };
  }
  
  // ==================== 会议生命周期 ====================
  
  /**
   * 创建会议
   * @param {Object} config 会议配置
   */
  async createMeeting(config) {
    const meetingId = config.meetingId || uuidv4();
    const meetingType = config.meetingType || 'CONSULTATION';
    
    // 获取流程配置
    const flow = getFlowConfig(meetingType);
    
    // 估算时长（简单计算）
    const estimatedDuration = flow.stages 
      ? `${flow.stages.length * 10} 分钟`
      : '未知';
    
    // 创建会议状态
    const meetingState = {
      id: meetingId,
      meetingType,
      flowType: flow.type,
      topic: config.topic,
      description: config.description || '',
      
      // 参与者
      participants: config.participants || { cppcc: [], npc: [] },
      expertiseBindings: config.expertiseBindings || {},
      
      // 流程状态
      currentStageIndex: -1,
      currentStage: null,
      stageResults: {},
      
      // 收集器 ID 映射
      collectionIds: {},
      
      // 状态
      status: 'initialized',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 持久化状态
    if (this.stateManager) {
      this.stateManager.createMeeting(meetingState);
    }
    
    // 添加到活跃会议
    this.activeMeetings.set(meetingId, meetingState);
    this.stats.totalMeetings++;
    this.stats.activeMeetings++;
    
    this.emit('meeting:created', { meetingId, meetingType, topic: config.topic });
    
    return {
      meetingId,
      flow: {
        type: flow.type,
        name: flow.name,
        totalStages: flow.stages ? flow.stages.length : 0,
        estimatedDuration
      },
      status: 'initialized'
    };
  }
  
  /**
   * 开始会议
   * @param {string} meetingId 会议 ID
   */
  async startMeeting(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    if (meeting.status !== 'initialized' && meeting.status !== 'paused') {
      throw new Error(`会议状态不允许启动: ${meeting.status}`);
    }
    
    meeting.status = 'in_progress';
    meeting.startedAt = new Date().toISOString();
    
    // 更新状态
    this._updateMeetingState(meetingId, { status: 'in_progress' });
    
    this.emit('meeting:started', { meetingId });
    
    // 开始第一阶段
    return this.nextStage(meetingId);
  }
  
  /**
   * 执行下一阶段
   * @param {string} meetingId 会议 ID
   */
  async nextStage(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    const flow = getFlowConfig(meeting.meetingType);
    
    // 检查是否还有下一阶段
    if (meeting.currentStageIndex >= flow.stages.length - 1) {
      return this.completeMeeting(meetingId);
    }
    
    // 移动到下一阶段
    meeting.currentStageIndex++;
    const stage = flow.stages[meeting.currentStageIndex];
    meeting.currentStage = stage.id;
    
    // 更新状态
    this._updateMeetingState(meetingId, {
      currentStageIndex: meeting.currentStageIndex,
      currentStage: stage.id
    });
    
    this.emit('stage:started', {
      meetingId,
      stageId: stage.id,
      stageName: stage.name,
      stageIndex: meeting.currentStageIndex
    });
    
    // 执行阶段
    const stageResult = await this._executeStage(meetingId, stage);
    
    return stageResult;
  }
  
  /**
   * 完成当前阶段
   * @param {string} meetingId 会议 ID
   * @param {Object} result 阶段结果
   */
  async completeStage(meetingId, result) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    const flow = getFlowConfig(meeting.meetingType);
    const stage = flow.stages[meeting.currentStageIndex];
    
    // 记录阶段结果
    meeting.stageResults[stage.id] = {
      ...result,
      completedAt: new Date().toISOString()
    };
    
    // 更新状态
    this._updateMeetingState(meetingId, {
      stageResults: meeting.stageResults
    });
    
    this.emit('stage:completed', {
      meetingId,
      stageId: stage.id,
      stageName: stage.name,
      result
    });
    
    // 检查是否并行阶段且需要等待
    if (stage.parallel && this.agentCoordinator) {
      const collectionId = meeting.collectionIds[stage.id];
      if (collectionId) {
        await this.agentCoordinator.waitForCompletion(collectionId);
      }
    }
    
    // 继续下一阶段
    return this.nextStage(meetingId);
  }
  
  /**
   * 完成会议
   * @param {string} meetingId 会议 ID
   */
  async completeMeeting(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    meeting.status = 'completed';
    meeting.completedAt = new Date().toISOString();
    
    // 更新状态
    this._updateMeetingState(meetingId, {
      status: 'completed',
      completedAt: meeting.completedAt
    });
    
    // 更新统计
    this.stats.completedMeetings++;
    this.stats.activeMeetings--;
    
    this.emit('meeting:completed', { meetingId, stageResults: meeting.stageResults });
    
    return {
      meetingId,
      status: 'completed',
      completedAt: meeting.completedAt,
      stageResults: meeting.stageResults
    };
  }
  
  /**
   * 暂停会议
   * @param {string} meetingId 会议 ID
   * @param {string} reason 暂停原因
   */
  pauseMeeting(meetingId, reason = null) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    meeting.status = 'paused';
    meeting.pauseReason = reason;
    
    this._updateMeetingState(meetingId, { status: 'paused' });
    
    this.emit('meeting:paused', { meetingId, reason });
    
    return { meetingId, status: 'paused' };
  }
  
  /**
   * 恢复会议
   * @param {string} meetingId 会议 ID
   */
  resumeMeeting(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    if (meeting.status !== 'paused') {
      throw new Error(`会议状态不允许恢复: ${meeting.status}`);
    }
    
    meeting.status = 'in_progress';
    delete meeting.pauseReason;
    
    this._updateMeetingState(meetingId, { status: 'in_progress' });
    
    this.emit('meeting:resumed', { meetingId });
    
    return { meetingId, status: 'in_progress' };
  }
  
  // ==================== 阶段执行 ====================
  
  /**
   * 执行阶段
   * @param {string} meetingId 会议 ID
   * @param {Object} stage 阶段配置
   */
  async _executeStage(meetingId, stage) {
    const meeting = this.activeMeetings.get(meetingId);
    
    // 根据阶段配置选择执行策略
    const result = {
      stageId: stage.id,
      stageName: stage.name,
      participants: stage.participants,
      activities: stage.activities,
      outputs: stage.outputs
    };
    
    // 如果需要收集响应，启动收集器
    if (stage.parallel && this.agentCoordinator && stage.participants.length > 0) {
      const expectedAgents = this._resolveParticipants(meeting, stage.participants);
      
      const collection = this.agentCoordinator.startCollection({
        meetingId,
        stage: stage.id,
        expectedAgents,
        timeout: this._parseDuration(stage.duration)
      });
      
      meeting.collectionIds[stage.id] = collection.collectionId;
      
      // 发送消息给参与者
      if (this.messageAdapter) {
        await this.messageAdapter.broadcast(expectedAgents, {
          type: 'stage:execute',
          meetingId,
          stageId: stage.id,
          stageName: stage.name,
          activities: stage.activities,
          outputs: stage.outputs
        });
      }
      
      result.collectionId = collection.collectionId;
      result.expectedAgents = expectedAgents;
    }
    
    return result;
  }
  
  /**
   * 解析参与者列表
   */
  _resolveParticipants(meeting, participantTypes) {
    const agents = [];
    
    for (const type of participantTypes) {
      if (type === '政协委员' || type === 'cppcc') {
        agents.push(...(meeting.participants.cppcc || []));
      } else if (type === '人大代表' || type === 'npc') {
        agents.push(...(meeting.participants.npc || []));
      }
    }
    
    return agents;
  }
  
  /**
   * 解析时长
   */
  _parseDuration(duration) {
    if (!duration) return 60000;
    
    const match = duration.match(/(\d+)\s*(分钟|小时|秒)/);
    if (!match) return 60000;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case '秒': return value * 1000;
      case '分钟': return value * 60 * 1000;
      case '小时': return value * 60 * 60 * 1000;
      default: return 60000;
    }
  }
  
  // ==================== 状态管理 ====================
  
  /**
   * 更新会议状态
   */
  _updateMeetingState(meetingId, updates) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (meeting) {
      Object.assign(meeting, updates, { updatedAt: new Date().toISOString() });
    }
    
    // 持久化
    if (this.stateManager) {
      this.stateManager.updateMeeting(meetingId, updates);
    }
  }
  
  /**
   * 获取会议状态
   * @param {string} meetingId 会议 ID
   */
  getMeetingState(meetingId) {
    return this.activeMeetings.get(meetingId);
  }
  
  /**
   * 获取进度
   * @param {string} meetingId 会议 ID
   */
  getProgress(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    
    if (!meeting) {
      return null;
    }
    
    const flow = getFlowConfig(meeting.meetingType);
    
    return {
      meetingId,
      status: meeting.status,
      currentStageIndex: meeting.currentStageIndex,
      totalStages: flow.stages.length,
      percentage: Math.round((meeting.currentStageIndex + 1) / flow.stages.length * 100),
      currentStage: meeting.currentStage,
      stageResults: meeting.stageResults
    };
  }
  
  // ==================== 恢复 ====================
  
  /**
   * 恢复会议执行
   * @param {string} meetingId 会议 ID
   */
  async resumeFromPersisted(meetingId) {
    if (!this.stateManager) {
      throw new Error('StateManager 未配置');
    }
    
    const meetingState = this.stateManager.getMeeting(meetingId);
    
    if (!meetingState) {
      throw new Error(`会议不存在: ${meetingId}`);
    }
    
    // 添加到活跃会议
    this.activeMeetings.set(meetingId, meetingState);
    this.stats.activeMeetings++;
    
    // 恢复状态
    if (meetingState.status === 'in_progress') {
      this.emit('meeting:recovered', { meetingId, stage: meetingState.currentStage });
    }
    
    return meetingState;
  }
  
  // ==================== 统计 ====================
  
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

module.exports = { MeetingFlowEngine };