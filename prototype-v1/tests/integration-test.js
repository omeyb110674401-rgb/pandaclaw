/**
 * PandaClaw 集成测试
 * @author npc-5 (智能体编排者)
 * @version 1.0.0
 * 
 * 验收标准：
 * - Meeting 接口符合契约
 * - StateSnapshot 接口符合契约
 * - AgentStatus 接口符合契约
 * - MessageAdapter 接口符合契约
 * - MeetingStatus 枚举符合契约
 * - 时间戳格式（毫秒）符合契约
 */

const path = require('path');

// 导入核心模块
const { StateManager } = require('../src/core/StateManager');
const { AgentCoordinator } = require('../src/core/AgentCoordinator');
const { MessageAdapter } = require('../src/messaging/MessageAdapter');
const { MeetingFlowEngine, MeetingStatus } = require('../src/core/MeetingFlowEngine');

// 测试配置
const testConfig = {
  dbPath: path.join(__dirname, 'test-data', 'test.db'),
  enableReliable: false // 测试环境禁用 BullMQ
};

// 测试结果收集
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * 测试辅助函数
 */
function test(name, fn) {
  try {
    fn();
    testResults.passed++;
    testResults.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: '❌ FAIL', error: error.message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertType(value, type, message) {
  if (typeof value !== type) {
    throw new Error(`${message}: expected ${type}, got ${typeof value}`);
  }
}

function assertValidEnum(value, enumValues, message) {
  if (!enumValues.includes(value)) {
    throw new Error(`${message}: ${value} not in valid values [${enumValues.join(', ')}]`);
  }
}

/**
 * 契约验证测试
 */
async function runContractTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('契约合规性测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 初始化模块
  const stateManager = new StateManager(testConfig).initialize();
  const agentCoordinator = new AgentCoordinator();
  const messageAdapter = new MessageAdapter(testConfig);
  const flowEngine = new MeetingFlowEngine({
    stateManager,
    messageAdapter,
    agentCoordinator
  });
  
  // ==================== Meeting 接口验证 ====================
  
  test('Meeting.id 应为 string', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    assertType(meeting.id, 'string', 'Meeting.id');
  });
  
  test('Meeting.version 应为 number', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    assertType(meeting.version, 'number', 'Meeting.version');
    assertEqual(meeting.version, 1, 'Meeting.version 应为契约版本 1');
  });
  
  test('Meeting.createdAt 应为毫秒时间戳', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    assertType(meeting.createdAt, 'number', 'Meeting.createdAt');
    // 检查是否是毫秒（数值应大于 1e12）
    if (meeting.createdAt < 1e12) {
      throw new Error('Meeting.createdAt 不是毫秒格式');
    }
  });
  
  test('Meeting.status 应为有效 MeetingStatus', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    const validStatuses = [
      'pending', 'step1-alignment', 'step2-information', 'step3-roles',
      'step4-coordination', 'step5-deliberation', 'step6-voting',
      'step7-decision', 'completed', 'cancelled'
    ];
    assertValidEnum(meeting.status, validStatuses, 'Meeting.status');
  });
  
  // ==================== StateSnapshot 接口验证 ====================
  
  test('StateSnapshot.checksum 应为 string', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    const snapshot = stateManager.createSnapshot(meeting.id, 1, { test: 'data' });
    assertType(snapshot.checksum, 'string', 'StateSnapshot.checksum');
    assertEqual(snapshot.checksum.length, 16, 'checksum 应为 16 位');
  });
  
  test('StateSnapshot.timestamp 应为毫秒时间戳', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    const snapshot = stateManager.createSnapshot(meeting.id, 1, { test: 'data' });
    assertType(snapshot.timestamp, 'number', 'StateSnapshot.timestamp');
    if (snapshot.timestamp < 1e12) {
      throw new Error('StateSnapshot.timestamp 不是毫秒格式');
    }
  });
  
  test('StateManager.verifySnapshot 应验证 checksum', () => {
    const meeting = stateManager.createMeeting({ topic: '测试会议' });
    const snapshot = stateManager.createSnapshot(meeting.id, 1, { test: 'data' });
    const isValid = stateManager.verifySnapshot(snapshot);
    assertEqual(isValid, true, 'checksum 验证');
  });
  
  // ==================== AgentStatus 接口验证 ====================
  
  test('AgentStatus.lastHeartbeat 应为毫秒时间戳', () => {
    const status = stateManager.heartbeat({
      agentId: 'test-agent',
      status: 'active'
    });
    assertType(status.lastHeartbeat, 'number', 'AgentStatus.lastHeartbeat');
    if (status.lastHeartbeat < 1e12) {
      throw new Error('AgentStatus.lastHeartbeat 不是毫秒格式');
    }
  });
  
  test('AgentStatus.status 应为有效值', () => {
    const status = stateManager.heartbeat({
      agentId: 'test-agent',
      status: 'active'
    });
    const validStatuses = ['active', 'idle', 'busy', 'error'];
    assertValidEnum(status.status, validStatuses, 'AgentStatus.status');
  });
  
  // ==================== MessageAdapter 接口验证 ====================
  
  test('MessageAdapter.send 应返回 messageId', async () => {
    const messageId = await messageAdapter.send({
      meetingId: 'test-meeting',
      from: 'test-agent',
      to: 'all',
      type: 'step:notification',
      payload: { content: 'test' }
    });
    assertType(messageId, 'string', 'messageId');
  });
  
  test('MessageAdapter.getStats 应返回 HealthCheckResponse.metrics', () => {
    const stats = messageAdapter.getStats();
    assertType(stats.messagesProcessed, 'number', 'messagesProcessed');
    assertType(stats.averageLatency, 'number', 'averageLatency');
    assertType(stats.errorRate, 'number', 'errorRate');
  });
  
  // ==================== AgentCoordinator 同步屏障验证 ====================
  
  test('AgentCoordinator.startCollection 应创建收集器', () => {
    const result = agentCoordinator.startCollection({
      meetingId: 'test-meeting',
      stage: 'step5-1',
      expectedAgents: ['cppcc-1', 'cppcc-2', 'cppcc-3']
    });
    assertType(result.collectionId, 'string', 'collectionId');
  });
  
  test('AgentCoordinator.recordResponse 应记录响应', () => {
    const collection = agentCoordinator.startCollection({
      meetingId: 'test-meeting',
      stage: 'step5-1',
      expectedAgents: ['cppcc-1']
    });
    
    const result = agentCoordinator.recordResponse(
      collection.collectionId,
      'cppcc-1',
      { opinion: '测试意见' }
    );
    
    assertEqual(result.success, true, 'recordResponse');
    assertEqual(result.complete, true, 'completion');
  });
  
  // ==================== MeetingFlowEngine 流程验证 ====================
  
  test('MeetingFlowEngine.createMeeting 应创建会议', async () => {
    const result = await flowEngine.createMeeting({
      topic: '集成测试会议',
      type: 'proposal-review'
    });
    assertType(result.meetingId, 'string', 'meetingId');
    assertEqual(result.meeting.status, 'pending', '初始状态');
  });
  
  test('MeetingFlowEngine 状态转换应符合 MeetingStatus', async () => {
    const result = await flowEngine.createMeeting({
      topic: '状态转换测试'
    });
    
    await flowEngine.startMeeting(result.meetingId);
    const meeting = flowEngine.getMeeting(result.meetingId);
    
    const validStatuses = Object.values(MeetingStatus);
    assertValidEnum(meeting.status, validStatuses, '状态转换');
  });
  
  // 清理
  stateManager.close();
  
  return testResults;
}

/**
 * 运行测试
 */
async function main() {
  console.log('\n====================================');
  console.log('PandaClaw 集成测试报告');
  console.log('====================================\n');
  console.log('测试时间:', new Date().toISOString());
  console.log('测试环境:', process.env.NODE_ENV || 'test');
  
  await runContractTests();
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试结果汇总');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`总测试数: ${testResults.passed + testResults.failed}`);
  console.log(`✅ 通过: ${testResults.passed}`);
  console.log(`❌ 失败: ${testResults.failed}`);
  console.log(`通过率: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n失败测试列表:');
    testResults.tests
      .filter(t => t.status.includes('FAIL'))
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }
  
  console.log('\n====================================');
  
  // 返回结果供协调者使用
  return testResults;
}

// 导出供模块使用
module.exports = { runContractTests, testResults };

// 直接运行
if (require.main === module) {
  main().catch(console.error);
}