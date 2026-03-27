/**
 * PandaClaw 契约合规测试
 * @author cppcc-2 (后端专家)
 */

const assert = require('assert');
const path = require('path');

// 测试 StateManager 契约合规
async function testStateManagerContract() {
  console.log('\n📋 测试 StateManager 契约合规...');
  
  const { StateManager, CONTRACT_VERSION } = require('../src/core/StateManager');
  
  const sm = new StateManager({
    dbPath: path.join(__dirname, '..', 'data', 'test-contract.db')
  });
  
  sm.initialize();
  
  // 测试 Meeting 接口
  const meeting = sm.createMeeting({
    topic: '契约测试会议',
    type: 'proposal-review',
    participants: {
      cppcc: [{ id: 'cppcc-1', expertise: '后端专家' }],
      npc: [{ id: 'npc-1', expertise: '系统架构师' }]
    }
  });
  
  // 验证 Meeting 接口字段
  assert.ok(meeting.id, '应有 id');
  assert.strictEqual(meeting.version, CONTRACT_VERSION, '应有契约版本');
  assert.strictEqual(typeof meeting.createdAt, 'number', 'createdAt 应为毫秒时间戳');
  assert.strictEqual(typeof meeting.updatedAt, 'number', 'updatedAt 应为毫秒时间戳');
  assert.strictEqual(meeting.status, 'pending', '初始状态应为 pending');
  console.log('   ✅ Meeting 接口符合契约');
  
  // 测试 MeetingStatus 状态转换
  sm.updateMeetingStatus(meeting.id, 'step1-alignment');
  const updated = sm.getMeeting(meeting.id);
  assert.strictEqual(updated.status, 'step1-alignment', '状态应更新');
  console.log('   ✅ MeetingStatus 符合契约');
  
  // 测试 StateSnapshot
  const snapshot = sm.createSnapshot(meeting.id, 1, { test: 'data' });
  assert.ok(snapshot.checksum, '快照应有 checksum');
  assert.strictEqual(typeof snapshot.timestamp, 'number', '快照时间戳应为数字');
  console.log('   ✅ StateSnapshot 接口符合契约');
  
  // 测试 checksum 验证
  const verified = sm.verifySnapshot(snapshot);
  assert.strictEqual(verified, true, 'checksum 应验证通过');
  console.log('   ✅ Checksum 验证通过');
  
  // 测试 AgentStatus
  const agentStatus = sm.heartbeat({
    agentId: 'cppcc-1',
    status: 'active',
    expertise: '后端专家'
  });
  assert.strictEqual(typeof agentStatus.lastHeartbeat, 'number', '心跳时间应为数字');
  console.log('   ✅ AgentStatus 接口符合契约');
  
  sm.close();
  console.log('   ✅ StateManager 契约测试通过');
}

// 测试 MessageAdapter 契约合规
async function testMessageAdapterContract() {
  console.log('\n📋 测试 MessageAdapter 契约合规...');
  
  const { MessageAdapter, QUEUE_CONFIG, CONTRACT_VERSION } = require('../src/messaging/MessageAdapter');
  
  const adapter = new MessageAdapter({
    enableReliable: false
  });
  
  // 测试队列配置
  assert.ok(QUEUE_CONFIG.QUEUES.SEND_QUEUE, '应有 SEND_QUEUE 配置');
  assert.ok(QUEUE_CONFIG.QUEUES.RECEIVE_QUEUE, '应有 RECEIVE_QUEUE 配置');
  assert.ok(QUEUE_CONFIG.QUEUES.DEAD_LETTER_QUEUE, '应有 DEAD_LETTER_QUEUE 配置');
  console.log('   ✅ QUEUE_CONFIG 符合契约');
  
  // 测试消息发送
  let receivedMessage = null;
  adapter.subscribe('test-agent', async (msg) => {
    receivedMessage = msg;
  });
  
  const messageId = await adapter.send({
    meetingId: 'test-meeting',
    from: 'main',
    to: 'test-agent',
    type: 'step:notification',
    payload: { content: 'test' }
  });
  
  assert.ok(messageId, '应返回消息ID');
  console.log('   ✅ send() 接口符合契约');
  
  // 等待消息接收
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 测试统计接口
  const stats = adapter.getStats();
  assert.strictEqual(typeof stats.messagesProcessed, 'number', '应有 messagesProcessed');
  assert.strictEqual(typeof stats.averageLatency, 'number', '应有 averageLatency');
  assert.strictEqual(typeof stats.errorRate, 'number', '应有 errorRate');
  console.log('   ✅ HealthCheckResponse.metrics 符合契约');
  
  // 测试 ack
  await adapter.ack(messageId);
  console.log('   ✅ ack() 接口符合契约');
  
  await adapter.close();
  console.log('   ✅ MessageAdapter 契约测试通过');
}

// 测试 MeetingFlowEngine 契约合规
async function testMeetingFlowEngineContract() {
  console.log('\n📋 测试 MeetingFlowEngine 契约合规...');
  
  const { MeetingFlowEngine, MeetingStatus, MeetingEventType, CONTRACT_VERSION } = require('../src/core/MeetingFlowEngine');
  
  const engine = new MeetingFlowEngine();
  
  // 测试 MeetingStatus 枚举
  assert.ok(MeetingStatus.PENDING, '应有 PENDING 状态');
  assert.ok(MeetingStatus.STEP1_ALIGNMENT, '应有 STEP1_ALIGNMENT 状态');
  assert.ok(MeetingStatus.STEP5_DELIBERATION, '应有 STEP5_DELIBERATION 状态');
  assert.ok(MeetingStatus.COMPLETED, '应有 COMPLETED 状态');
  console.log('   ✅ MeetingStatus 枚举符合契约');
  
  // 测试 MeetingEventType 枚举
  assert.ok(MeetingEventType.CREATED, '应有 CREATED 事件');
  assert.ok(MeetingEventType.STEP_CHANGED, '应有 STEP_CHANGED 事件');
  assert.ok(MeetingEventType.VOTE_CAST, '应有 VOTE_CAST 事件');
  console.log('   ✅ MeetingEventType 枚举符合契约');
  
  // 创建会议
  const { meetingId, meeting } = await engine.createMeeting({
    topic: '流程测试',
    type: 'proposal-review',
    participants: {
      cppcc: [{ id: 'cppcc-1', expertise: '后端专家' }],
      npc: [{ id: 'npc-1', expertise: '系统架构师' }]
    }
  });
  
  assert.strictEqual(meeting.version, CONTRACT_VERSION, '会议应有契约版本');
  console.log('   ✅ Meeting 创建符合契约');
  
  // 测试状态转换
  await engine.startMeeting(meetingId);
  let progress = engine.getProgress(meetingId);
  assert.strictEqual(progress.status, MeetingStatus.STEP1_ALIGNMENT, '应进入步骤1');
  console.log('   ✅ 状态转换符合契约');
  
  // 快速推进到步骤5测试意见提交
  const meeting2 = engine.getMeeting(meetingId);
  meeting2.status = MeetingStatus.STEP5_DELIBERATION;
  
  await engine.submitOpinion(meetingId, 'cppcc-1', '我同意这个方案');
  console.log('   ✅ submitOpinion 符合契约');
  
  await engine.recordStance(meetingId, 'cppcc-1', 'endorse', '完全同意');
  console.log('   ✅ recordStance 符合契约');
  
  // 测试投票
  meeting2.status = MeetingStatus.STEP6_VOTING;
  await engine.castVote(meetingId, 'npc-1', 'approve', '方案可行');
  console.log('   ✅ castVote 符合契约');
  
  // 测试决策
  meeting2.status = MeetingStatus.STEP7_DECISION;
  const result = await engine.makeDecision(meetingId, '通过方案', '多数赞成');
  assert.ok(result.passed !== undefined, '应有 passed 字段');
  console.log('   ✅ makeDecision 符合契约');
  
  // 验证最终状态
  progress = engine.getProgress(meetingId);
  assert.strictEqual(progress.status, MeetingStatus.COMPLETED, '应已完成');
  console.log('   ✅ 会议完成状态符合契约');
  
  console.log('   ✅ MeetingFlowEngine 契约测试通过');
}

// 运行所有测试
async function runAllTests() {
  console.log('========================================');
  console.log('  PandaClaw 契约合规测试');
  console.log('========================================');
  
  try {
    await testStateManagerContract();
    await testMessageAdapterContract();
    await testMeetingFlowEngineContract();
    
    console.log('\n========================================');
    console.log('  ✅ 所有契约测试通过！');
    console.log('========================================');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllTests();