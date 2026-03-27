/**
 * PandaClaw 核心模块测试
 * @author cppcc-2 (后端专家)
 */

const assert = require('assert');
const path = require('path');

// 测试 StateManager
async function testStateManager() {
  console.log('\n📋 测试 StateManager...');
  
  const { StateManager } = require('../src/core/StateManager');
  
  const sm = new StateManager({
    dbPath: path.join(__dirname, '..', 'data', 'test.db')
  });
  
  sm.initialize();
  
  // 测试创建会议
  const meeting = sm.createMeeting({
    meetingType: 'CONSULTATION',
    topic: '测试会议',
    description: '这是一个测试会议'
  });
  
  assert.ok(meeting.id, '会议ID应该存在');
  assert.strictEqual(meeting.status, 'pending', '初始状态应为pending');
  console.log('   ✅ 创建会议成功');
  
  // 测试获取会议
  const fetched = sm.getMeeting(meeting.id);
  assert.strictEqual(fetched.topic, '测试会议', '议题应该匹配');
  console.log('   ✅ 获取会议成功');
  
  // 测试更新会议
  const updated = sm.updateMeeting(meeting.id, { status: 'in_progress' });
  assert.strictEqual(updated.status, 'in_progress', '状态应已更新');
  console.log('   ✅ 更新会议成功');
  
  // 测试消息日志
  const messageId = sm.logMessage({
    meetingId: meeting.id,
    direction: 'outbound',
    sender: 'main',
    receiver: 'cppcc-1',
    content: { type: 'test', text: 'hello' }
  });
  assert.ok(messageId, '消息ID应该存在');
  console.log('   ✅ 消息日志成功');
  
  // 测试 Agent 注册
  const agent = sm.registerAgent('cppcc-1', {
    expertiseId: 'backend-expert',
    expertiseName: '后端专家'
  });
  assert.strictEqual(agent.expertiseName, '后端专家', '专家名称应匹配');
  console.log('   ✅ Agent注册成功');
  
  // 获取统计
  const stats = sm.getStats();
  console.log('   📊 统计:', stats);
  
  sm.close();
  console.log('   ✅ StateManager 测试通过');
}

// 测试 AgentCoordinator
async function testAgentCoordinator() {
  console.log('\n📋 测试 AgentCoordinator...');
  
  const { AgentCoordinator } = require('../src/core/AgentCoordinator');
  
  const coordinator = new AgentCoordinator({
    defaultTimeout: 5000,
    pollInterval: 500
  });
  
  // 注册 Agents
  coordinator.registerAgent('cppcc-1');
  coordinator.registerAgent('cppcc-2');
  coordinator.registerAgent('npc-1');
  console.log('   ✅ Agent注册成功');
  
  // 开始收集
  const collection = coordinator.startCollection({
    meetingId: 'test-meeting',
    stage: 'deliberation_round1',
    expectedAgents: ['cppcc-1', 'cppcc-2', 'npc-1'],
    timeout: 5000
  });
  
  assert.ok(collection.collectionId, '收集器ID应该存在');
  console.log('   ✅ 开始收集成功');
  
  // 记录响应
  coordinator.recordResponse(collection.collectionId, 'cppcc-1', { opinion: '同意' });
  coordinator.recordResponse(collection.collectionId, 'cppcc-2', { opinion: '补充' });
  
  // 检查完成状态
  const status = coordinator.checkCompletion(collection.collectionId);
  assert.strictEqual(status.respondedCount, 2, '应有2个响应');
  console.log('   ✅ 响应记录成功');
  
  // 记录最后一个响应
  coordinator.recordResponse(collection.collectionId, 'npc-1', { vote: '赞成' });
  
  // 检查是否完成
  const finalStatus = coordinator.checkCompletion(collection.collectionId);
  assert.strictEqual(finalStatus.complete, true, '应该完成');
  console.log('   ✅ 收集完成验证成功');
  
  // 获取统计
  const stats = coordinator.getStats();
  console.log('   📊 统计:', stats);
  
  console.log('   ✅ AgentCoordinator 测试通过');
}

// 测试 MessageAdapter
async function testMessageAdapter() {
  console.log('\n📋 测试 MessageAdapter...');
  
  const { MessageAdapter } = require('../src/messaging/MessageAdapter');
  
  const adapter = new MessageAdapter({
    reliablePathEnabled: false // 测试模式不启用 Redis
  });
  
  // 订阅消息
  let receivedMessage = null;
  adapter.subscribe('test_message', (msg) => {
    receivedMessage = msg;
  });
  console.log('   ✅ 消息订阅成功');
  
  // 发送消息
  const result = await adapter.send({
    type: 'test_message',
    content: { text: 'hello' }
  });
  
  assert.strictEqual(result.status, 'sent', '消息应发送成功');
  console.log('   ✅ 消息发送成功');
  
  // 等待消息接收
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 测试去重
  const dupResult = await adapter.send({
    messageId: result.messageId, // 使用相同的ID
    type: 'test_message',
    content: { text: 'duplicate' }
  });
  
  assert.strictEqual(dupResult.status, 'duplicate', '重复消息应被识别');
  console.log('   ✅ 消息去重成功');
  
  // 获取统计
  const stats = adapter.getStats();
  console.log('   📊 统计:', stats);
  
  await adapter.close();
  console.log('   ✅ MessageAdapter 测试通过');
}

// 测试 MeetingFlowEngine
async function testMeetingFlowEngine() {
  console.log('\n📋 测试 MeetingFlowEngine...');
  
  const { MeetingFlowEngine } = require('../src/core/MeetingFlowEngine');
  
  const engine = new MeetingFlowEngine({
    stateManager: null, // 测试模式不使用持久化
    messageAdapter: null,
    agentCoordinator: null
  });
  
  // 创建会议
  const meeting = await engine.createMeeting({
    meetingType: 'CONSULTATION',
    topic: '流程测试会议',
    participants: {
      cppcc: ['cppcc-1', 'cppcc-2'],
      npc: ['npc-1']
    }
  });
  
  assert.ok(meeting.meetingId, '会议ID应该存在');
  console.log('   ✅ 创建会议成功');
  
  // 获取进度
  const progress = engine.getProgress(meeting.meetingId);
  assert.strictEqual(progress.status, 'initialized', '状态应为initialized');
  console.log('   ✅ 获取进度成功');
  
  // 开始会议
  const startResult = await engine.startMeeting(meeting.meetingId);
  assert.ok(startResult.stageId, '应有阶段ID');
  console.log('   ✅ 开始会议成功');
  
  // 检查统计
  const stats = engine.getStats();
  assert.strictEqual(stats.totalMeetings, 1, '应有1个会议');
  console.log('   📊 统计:', stats);
  
  console.log('   ✅ MeetingFlowEngine 测试通过');
}

// 运行所有测试
async function runAllTests() {
  console.log('========================================');
  console.log('  PandaClaw 核心模块测试');
  console.log('========================================');
  
  try {
    await testStateManager();
    await testAgentCoordinator();
    await testMessageAdapter();
    await testMeetingFlowEngine();
    
    console.log('\n========================================');
    console.log('  ✅ 所有测试通过！');
    console.log('========================================');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
runAllTests();