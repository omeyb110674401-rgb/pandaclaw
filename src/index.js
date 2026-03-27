/**
 * PandaClaw - 民主协商决策系统
 * @module pandaclaw
 * @version 1.0.0
 * 
 * 核心模块：
 * - core/StateManager - 状态管理器（WAL支持）
 * - core/AgentCoordinator - Agent协调器
 * - core/MeetingFlowEngine - 会议流程引擎
 * - messaging/MessageAdapter - 消息适配器
 */

// 核心模块
const { StateManager, AgentCoordinator, MeetingFlowEngine } = require('./core');
const { MessageAdapter, FastPathChannel, ReliablePathChannel } = require('./messaging');

// 现有模块（兼容）
const DemocraticMeetingSystem = require('./democratic-meeting-system');
const MeetingFlowExecutor = require('./meeting-flow-executor');
const MeetingStateStore = require('./meeting-state-store');

/**
 * 创建 PandaClaw 实例
 * @param {Object} options 配置选项
 * @returns {Object} PandaClaw 实例
 */
function createPandaClaw(options = {}) {
  // 初始化状态管理器
  const stateManager = new StateManager({
    dbPath: options.dbPath,
    walEnabled: options.walEnabled !== false
  });
  stateManager.initialize();
  
  // 初始化消息适配器
  const messageAdapter = new MessageAdapter({
    redisHost: options.redisHost,
    redisPort: options.redisPort,
    reliablePathEnabled: options.reliablePathEnabled
  });
  
  // 初始化 Agent 协调器
  const agentCoordinator = new AgentCoordinator({
    defaultTimeout: options.defaultTimeout || 60000,
    maxRetries: options.maxRetries || 2
  });
  
  // 初始化会议流程引擎
  const flowEngine = new MeetingFlowEngine({
    stateManager,
    messageAdapter,
    agentCoordinator
  });
  
  return {
    stateManager,
    messageAdapter,
    agentCoordinator,
    flowEngine,
    
    /**
     * 创建会议
     */
    async createMeeting(config) {
      return flowEngine.createMeeting(config);
    },
    
    /**
     * 开始会议
     */
    async startMeeting(meetingId) {
      return flowEngine.startMeeting(meetingId);
    },
    
    /**
     * 获取统计信息
     */
    getStats() {
      return {
        state: stateManager.getStats(),
        messaging: messageAdapter.getStats(),
        coordination: agentCoordinator.getStats(),
        flow: flowEngine.getStats()
      };
    },
    
    /**
     * 关闭实例
     */
    async close() {
      await messageAdapter.close();
      stateManager.close();
    }
  };
}

module.exports = {
  // 新模块
  createPandaClaw,
  StateManager,
  AgentCoordinator,
  MeetingFlowEngine,
  MessageAdapter,
  FastPathChannel,
  ReliablePathChannel,
  
  // 兼容旧模块
  DemocraticMeetingSystem,
  MeetingFlowExecutor,
  MeetingStateStore
};