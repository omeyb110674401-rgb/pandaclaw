/**
 * 会议流程执行器 - 基于独立流程设计
 * @author cppcc-2 (后端专家) + cppcc-4 (产品专家)
 * @version 3.0 - 独立流程集成版
 * @updated 2026-03-27
 * 
 * 核心改动：
 * 1. 不再以七步闭环为预设
 * 2. 每种会议类型有独立的流程定义
 * 3. 流程执行器根据类型动态加载流程
 */

const fs = require('fs');
const path = require('path');

// 导入独立流程定义
const {
  CONSULTATION_FLOW,
  STRATEGIC_FLOW,
  RESOLUTION_FLOW,
  PLANNING_FLOW,
  LEGISLATIVE_FLOW,
  MINUTES_FLOW,
  getFlowConfig
} = require('./meeting-flow-independent');

// 导入状态存储
const {
  createMeetingState,
  loadState,
  saveState,
  updateStep: originalUpdateStep
} = require('./meeting-state-store');

/**
 * 会议流程执行器类
 */
class MeetingFlowExecutor {
  /**
   * 创建会议流程执行器
   * @param {string} meetingId 会议 ID
   * @param {string} meetingType 会议类型
   */
  constructor(meetingId, meetingType) {
    this.meetingId = meetingId;
    this.meetingType = meetingType;
    this.flow = getFlowConfig(meetingType);
    this.state = null;
    this.currentStageIndex = 0;
    this.stageHistory = [];
  }
  
  /**
   * 初始化会议
   * @param {Object} options 会议配置
   */
  async initialize(options) {
    // 验证参会人数是否符合流程要求
    const validation = this.validateParticipants(options.participants);
    if (!validation.valid) {
      throw new Error(`参会人数不符合要求：${validation.errors.join('，')}`);
    }
    
    // 创建会议状态
    this.state = {
      meetingId: this.meetingId,
      meetingType: this.meetingType,
      flowType: this.flow.type,
      topic: options.topic,
      description: options.description || '',
      participants: options.participants,
      expertiseBindings: options.expertiseBindings || {},
      
      // 流程状态
      currentStage: null,
      currentStageIndex: -1,
      stageResults: {},
      
      // 各阶段收集的数据
      stageData: {},
      
      // 状态
      status: 'initialized',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 保存初始状态
    this.saveState();
    
    return this.state;
  }
  
  /**
   * 验证参会人数
   */
  validateParticipants(participants) {
    const errors = [];
    
    // 根据流程配置验证
    const hasCppcc = participants.cppcc && participants.cppcc.length > 0;
    const hasNpc = participants.npc && participants.npc.length > 0;
    
    // 检查参与角色
    const participantRoles = this.flow.summary.participantRoles;
    
    if (participantRoles.cppcc && !hasCppcc) {
      errors.push(`该会议类型需要政协委员参与`);
    }
    
    if (participantRoles.npc && participantRoles.npc !== '（可选）' && !hasNpc) {
      errors.push(`该会议类型需要人大代表参与`);
    }
    
    // 立法型需要外部专家
    if (this.meetingType === 'LEGISLATIVE') {
      // 可以添加外部专家检查
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 开始下一阶段
   */
  async startNextStage() {
    this.currentStageIndex++;
    
    if (this.currentStageIndex >= this.flow.stages.length) {
      return this.complete();
    }
    
    const stage = this.flow.stages[this.currentStageIndex];
    
    console.log(`\n▶️ 开始阶段 ${this.currentStageIndex + 1}/${this.flow.stages.length}：${stage.name}`);
    console.log(`   说明：${stage.description}`);
    console.log(`   预计时长：${stage.duration}`);
    console.log(`   参与者：${stage.participants.join('、')}`);
    
    // 更新状态
    this.state.currentStage = stage.id;
    this.state.currentStageIndex = this.currentStageIndex;
    this.state.status = 'in_progress';
    this.state.currentStageStartedAt = new Date().toISOString();
    
    this.saveState();
    
    // 返回阶段信息
    return {
      stageId: stage.id,
      stageName: stage.name,
      stageIndex: this.currentStageIndex,
      totalStages: this.flow.stages.length,
      participants: stage.participants,
      activities: stage.activities,
      outputs: stage.outputs,
      duration: stage.duration,
      config: {
        parallel: stage.parallel,
        isolation: stage.isolation,
        required: stage.required,
        rounds: stage.rounds,
        voteRule: stage.voteRule
      }
    };
  }
  
  /**
   * 完成当前阶段
   * @param {Object} stageResult 阶段结果
   */
  async completeCurrentStage(stageResult) {
    const stage = this.flow.stages[this.currentStageIndex];
    
    console.log(`\n✅ 完成阶段：${stage.name}`);
    
    // 记录阶段结果
    this.state.stageResults[stage.id] = {
      ...stageResult,
      completedAt: new Date().toISOString(),
      duration: this.calculateStageDuration()
    };
    
    // 收集阶段数据
    if (stageResult.data) {
      this.state.stageData[stage.id] = stageResult.data;
    }
    
    // 记录历史
    this.stageHistory.push({
      stageId: stage.id,
      stageName: stage.name,
      completedAt: new Date().toISOString(),
      summary: stageResult.summary || ''
    });
    
    this.saveState();
    
    // 检查是否有下一阶段
    const hasNext = this.currentStageIndex < this.flow.stages.length - 1;
    
    return {
      stageCompleted: true,
      stageId: stage.id,
      hasNextStage: hasNext,
      nextStageIndex: hasNext ? this.currentStageIndex + 1 : null
    };
  }
  
  /**
   * 执行整个流程（自动化）
   */
  async executeAll() {
    console.log(`\n🚀 开始执行${this.flow.name}流程`);
    console.log(`   总阶段数：${this.flow.stages.length}`);
    console.log(`   预计时长：${this.flow.summary.estimatedDuration}\n`);
    
    while (this.currentStageIndex < this.flow.stages.length) {
      const stageInfo = await this.startNextStage();
      
      // 这里可以集成实际的活动执行逻辑
      // 目前返回阶段信息，由外部执行具体活动
      
      // 模拟阶段完成（实际应用中由外部调用 completeCurrentStage）
      await this.completeCurrentStage({
        summary: `${stageInfo.stageName}已完成`,
        data: {}
      });
    }
    
    return this.complete();
  }
  
  /**
   * 完成会议
   */
  async complete() {
    console.log(`\n🎉 会议流程完成！`);
    
    this.state.status = 'completed';
    this.state.completedAt = new Date().toISOString();
    this.state.stageHistory = this.stageHistory;
    
    this.saveState();
    
    return {
      meetingId: this.meetingId,
      meetingType: this.meetingType,
      status: 'completed',
      completedAt: this.state.completedAt,
      stageHistory: this.stageHistory,
      stageResults: this.state.stageResults
    };
  }
  
  /**
   * 获取当前进度
   */
  getProgress() {
    const totalStages = this.flow.stages.length;
    const completedStages = this.currentStageIndex + 1;
    const currentStage = this.flow.stages[this.currentStageIndex];
    
    return {
      currentStageIndex: this.currentStageIndex,
      totalStages,
      completedStages,
      percentage: Math.round((completedStages / totalStages) * 100),
      currentStage: currentStage ? {
        id: currentStage.id,
        name: currentStage.name,
        description: currentStage.description
      } : null,
      flowType: this.flow.type,
      flowName: this.flow.name
    };
  }
  
  /**
   * 获取剩余阶段
   */
  getRemainingStages() {
    return this.flow.stages.slice(this.currentStageIndex + 1).map(stage => ({
      id: stage.id,
      name: stage.name,
      duration: stage.duration
    }));
  }
  
  /**
   * 保存状态
   */
  saveState() {
    this.state.updatedAt = new Date().toISOString();
    
    const stateDir = path.join(__dirname, '..', 'meetings');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    
    const filePath = path.join(stateDir, `${this.meetingId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }
  
  /**
   * 加载状态
   */
  loadState() {
    const filePath = path.join(__dirname, '..', 'meetings', `${this.meetingId}.json`);
    if (fs.existsSync(filePath)) {
      this.state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.currentStageIndex = this.state.currentStageIndex || -1;
      this.stageHistory = this.state.stageHistory || [];
      return this.state;
    }
    return null;
  }
  
  /**
   * 计算阶段持续时间
   */
  calculateStageDuration() {
    if (this.state.currentStageStartedAt) {
      const start = new Date(this.state.currentStageStartedAt);
      const end = new Date();
      return Math.round((end - start) / 1000); // 秒
    }
    return 0;
  }
}

/**
 * 快速创建会议
 */
async function createMeeting(options) {
  const { meetingType = 'CONSULTATION', topic, description, participants } = options;
  
  const meetingId = `meeting-${meetingType.toLowerCase()}-${Date.now()}`;
  
  const executor = new MeetingFlowExecutor(meetingId, meetingType);
  
  await executor.initialize({
    topic,
    description,
    participants
  });
  
  return {
    meetingId,
    executor,
    flow: executor.flow
  };
}

/**
 * 从已有会议恢复执行器
 */
function resumeMeeting(meetingId) {
  const statePath = path.join(__dirname, '..', 'meetings', `${meetingId}.json`);
  
  if (!fs.existsSync(statePath)) {
    throw new Error(`会议不存在：${meetingId}`);
  }
  
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  
  const executor = new MeetingFlowExecutor(meetingId, state.meetingType);
  executor.state = state;
  executor.currentStageIndex = state.currentStageIndex || -1;
  executor.stageHistory = state.stageHistory || [];
  
  return executor;
}

/**
 * 获取会议流程配置（用于前端展示）
 */
function getMeetingFlowInfo(meetingType) {
  const flow = getFlowConfig(meetingType);
  
  return {
    type: flow.type,
    name: flow.name,
    icon: flow.icon,
    description: flow.description,
    estimatedDuration: flow.summary.estimatedDuration,
    stages: flow.stages.map((stage, index) => ({
      index: index + 1,
      id: stage.id,
      name: stage.name,
      description: stage.description,
      duration: stage.duration,
      participants: stage.participants,
      activities: stage.activities,
      outputs: stage.outputs,
      parallel: stage.parallel || false,
      required: stage.required || false
    }))
  };
}

module.exports = {
  MeetingFlowExecutor,
  createMeeting,
  resumeMeeting,
  getMeetingFlowInfo,
  // 导出流程配置供其他模块使用
  CONSULTATION_FLOW,
  STRATEGIC_FLOW,
  RESOLUTION_FLOW,
  PLANNING_FLOW,
  LEGISLATIVE_FLOW,
  MINUTES_FLOW
};