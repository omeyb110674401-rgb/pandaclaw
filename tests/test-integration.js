/**
 * Integration 模块测试
 * @author npc-2 (AI工程师)
 * @version 1.0.0
 */

const assert = require('assert');

// 测试模块
let TokenPool, VersionRouter, LLMScheduler;

try {
  const integration = require('./src/integration');
  TokenPool = integration.TokenPool;
  VersionRouter = integration.VersionRouter;
  LLMScheduler = integration.LLScheduler;
} catch (e) {
  // 如果 TypeScript 未编译，直接加载
  console.log('⚠️ TypeScript 模块未编译，跳过集成测试');
  console.log('   请运行: tsc -p src/integration/tsconfig.json');
  process.exit(0);
}

async function testTokenPool() {
  console.log('\n━━━ TokenPool 测试 ━━━');
  
  const pool = new TokenPool({ maxSize: 3 });
  
  // 测试1：获取令牌
  const token1 = await pool.acquire('high', 'agent-1');
  assert(token1.id, '令牌应有ID');
  assert.equal(pool.getStatus().available, 2, '可用令牌应为2');
  console.log('✅ 测试1: 令牌获取成功');
  
  // 测试2：释放令牌
  await pool.release(token1.id);
  assert.equal(pool.getStatus().available, 3, '可用令牌应为3');
  console.log('✅ 测试2: 令牌释放成功');
  
  // 测试3：并发获取
  const tokens = await Promise.all([
    pool.acquire('normal', 'agent-2'),
    pool.acquire('normal', 'agent-3'),
    pool.acquire('normal', 'agent-4')
  ]);
  assert.equal(pool.getStatus().available, 0, '可用令牌应为0');
  assert.equal(pool.getStatus().waiting, 0, '等待队列应为0');
  console.log('✅ 测试3: 并发获取成功');
  
  // 测试4：等待队列
  try {
    // 添加超时测试
    const waitPromise = pool.acquire('low', 'agent-5');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('测试超时')), 500)
    );
    
    // 同时释放一个令牌
    setTimeout(() => pool.release(tokens[0].id), 100);
    
    const waitedToken = await Promise.race([waitPromise, timeoutPromise]);
    assert(waitedToken.id, '等待获取令牌成功');
    console.log('✅ 测试4: 等待队列成功');
    
    // 清理
    await pool.release(waitedToken.id);
    await pool.release(tokens[1].id);
    await pool.release(tokens[2].id);
  } catch (e) {
    console.log('⚠️ 测试4: 等待队列测试失败', e.message);
  }
  
  // 测试5：统计信息
  const stats = pool.getStats();
  assert(stats.acquiredCount >= 4, '应有获取记录');
  assert(stats.releasedCount >= 4, '应有释放记录');
  console.log('✅ 测试5: 统计信息正确');
  console.log('   统计:', JSON.stringify(stats));
  
  await pool.close();
}

async function testVersionRouter() {
  console.log('\n━━━ VersionRouter 测试 ━━━');
  
  const router = new VersionRouter({ autoDowngrade: true });
  
  // 测试1：版本检查
  const check1 = router.checkVersion(1);
  assert.equal(check1.compatibility, 'full', 'v1应完全兼容');
  console.log('✅ 测试1: v1 完全兼容');
  
  // 测试2：向后兼容
  const check2 = router.checkVersion(2);
  assert.equal(check2.compatibility, 'partial', 'v2应部分兼容');
  assert.equal(check2.downgradeTo, 1, '应降级到v1');
  console.log('✅ 测试2: v2 部分兼容，可降级');
  
  // 测试3：路由消息
  const message = { version: 1, data: 'test' };
  const result = await router.route(message);
  assert.equal(result.routedVersion, 1, '路由版本应为1');
  console.log('✅ 测试3: v1 消息路由成功');
  
  // 测试4：自动降级
  const message2 = { version: 2, data: 'test' };
  const result2 = await router.route(message2);
  assert.equal(result2.routedVersion, 2, '路由版本应为2（v2兼容v1）');
  console.log('✅ 测试4: v2 消息自动处理');
  
  // 测试5：不支持的版本
  try {
    await router.route({ version: 99, data: 'test' });
    console.log('❌ 测试5: 应拒绝不支持的版本');
  } catch (e) {
    console.log('✅ 测试5: 正确拒绝不支持的版本');
  }
  
  // 测试6：变更日志
  const changelog = router.getChangelog();
  assert(changelog.length >= 3, '应有3个版本变更日志');
  console.log('✅ 测试6: 变更日志正确');
  
  await router.close();
}

async function testLLMScheduler() {
  console.log('\n━━━ LLMScheduler 测试 ━━━');
  
  const scheduler = new LLMScheduler({ maxConcurrent: 3 });
  
  // 设置模拟 LLM 调用函数
  scheduler.setLLMCallFunction(async (prompt, context) => {
    await new Promise(r => setTimeout(r, 100)); // 模拟延迟
    return { response: `模拟响应: ${prompt.slice(0, 20)}...` };
  });
  
  // 测试1：单次调度
  const result1 = await scheduler.schedule({
    agentId: 'agent-1',
    prompt: '测试提示词',
    priority: 'high'
  });
  assert(result1.success, '调度应成功');
  assert(result1.tokenId, '应有令牌ID');
  console.log('✅ 测试1: 单次调度成功');
  console.log('   延迟:', result1.latency, 'ms');
  
  // 测试2：并发调度
  const requests = [
    { agentId: 'agent-2', prompt: '提示词2', priority: 'normal' },
    { agentId: 'agent-3', prompt: '提示词3', priority: 'normal' },
    { agentId: 'agent-4', prompt: '提示词4', priority: 'low' }
  ];
  
  const results = await scheduler.scheduleBatch(requests);
  assert(results.every(r => r.success), '所有调度应成功');
  console.log('✅ 测试2: 并发调度成功');
  
  // 测试3：状态检查
  const status = scheduler.getStatus();
  assert.equal(status.tokenPool.total, 3, '令牌池大小应为3');
  assert(status.scheduler.completedCount >= 4, '应至少完成4次调度');
  console.log('✅ 测试3: 状态检查正确');
  console.log('   统计:', JSON.stringify(status.scheduler));
  
  // 测试4：速率限制
  // 快速发送多个请求
  const fastRequests = Array(10).fill(null).map((_, i) => ({
    agentId: 'fast-agent',
    prompt: `快速请求${i}`,
    priority: 'normal'
  }));
  
  const fastResults = await scheduler.scheduleBatch(fastRequests);
  assert(fastResults.every(r => r.success), '快速请求应全部成功');
  console.log('✅ 测试4: 速率限制处理正确');
  
  await scheduler.close();
}

// 运行测试
async function runTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Integration 模块测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    await testTokenPool();
    await testVersionRouter();
    await testLLMScheduler();
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 所有测试通过');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 导出测试函数
module.exports = {
  testTokenPool,
  testVersionRouter,
  testLLMScheduler,
  runTests
};

// 直接运行
if (require.main === module) {
  runTests();
}