/**
 * 测试运行器
 */

function runAllTests() {
  const tests = [
    testMeetingSystem,
    testExpertiseSystem,
    testProjectMatcher,
    testStateStore,
    testMessageTemplate
  ];
  
  return Promise.all(tests.map(run => run()));
}

async function testMeetingSystem() {
  console.log('📋 测试: 会议系统');
  try {
    const { MeetingManager } = require('../src/democratic-meeting-system');
    const manager = new MeetingManager();
    
    const meeting = manager.createMeeting({
      type: 'project-planning',
      topic: '测试议题',
      description: '测试描述',
      complexity: 'simple'
    });
    
    if (!meeting.id) throw new Error('会议ID未生成');
    if (meeting.complexity !== 'simple') throw new Error('复杂度设置错误');
    
    console.log('   ✅ 通过');
    return { name: 'MeetingSystem', passed: true };
  } catch (err) {
    console.log('   ❌ 失败:', err.message);
    return { name: 'MeetingSystem', passed: false, error: err.message };
  }
}

async function testExpertiseSystem() {
  console.log('📋 测试: 身份绑定系统');
  try {
    const expertise = require('../src/expertise-binding-system');
    
    // 测试绑定
    expertise.bindExpertise('test-npc', 'system-architect');
    
    // 测试生成提示词
    const prompt = expertise.generateSystemPrompt('test-npc');
    if (!prompt) throw new Error('提示词生成失败');
    
    console.log('   ✅ 通过');
    return { name: 'ExpertiseSystem', passed: true };
  } catch (err) {
    console.log('   ❌ 失败:', err.message);
    return { name: 'ExpertiseSystem', passed: false, error: err.message };
  }
}

async function testProjectMatcher() {
  console.log('📋 测试: 项目匹配系统');
  try {
    const matcher = require('../src/project-expertise-matcher');
    
    const result = matcher.generateBindingRecommendation(
      '开发一个AI Agent系统',
      'complex'
    );
    
    if (!result.projectType) throw new Error('项目类型识别失败');
    if (!result.bindings) throw new Error('身份绑定失败');
    
    console.log('   ✅ 通过');
    return { name: 'ProjectMatcher', passed: true };
  } catch (err) {
    console.log('   ❌ 失败:', err.message);
    return { name: 'ProjectMatcher', passed: false, error: err.message };
  }
}

async function testStateStore() {
  console.log('📋 测试: 状态存储');
  try {
    const store = require('../src/meeting-state-store');
    
    // 测试保存
    const testState = { id: 'test-123', status: 'active' };
    store.save(testState);
    
    // 测试加载
    const loaded = store.load('test-123');
    if (!loaded || loaded.status !== 'active') throw new Error('状态加载失败');
    
    console.log('   ✅ 通过');
    return { name: 'StateStore', passed: true };
  } catch (err) {
    console.log('   ❌ 失败:', err.message);
    return { name: 'StateStore', passed: false, error: err.message };
  }
}

async function testMessageTemplate() {
  console.log('📋 测试: 消息模板');
  try {
    const template = require('../src/meeting-message-template');
    
    // 测试纯净化
    const dirty = {
      topic: '测试议题',
      mainOpinion: '预设答案',  // 应被过滤
      expectedAnswer: '期望答案', // 应被过滤
      context: '背景信息'
    };
    
    const clean = template.purify(dirty);
    
    if (clean.mainOpinion) throw new Error('禁止字段未过滤');
    if (clean.expectedAnswer) throw new Error('禁止字段未过滤');
    if (!clean.topic) throw new Error('有效字段被误删');
    
    console.log('   ✅ 通过');
    return { name: 'MessageTemplate', passed: true };
  } catch (err) {
    console.log('   ❌ 失败:', err.message);
    return { name: 'MessageTemplate', passed: false, error: err.message };
  }
}

module.exports = { runAllTests };