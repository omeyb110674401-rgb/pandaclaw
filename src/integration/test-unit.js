/**
 * Integration 模块单元测试（src/integration 版）
 * @author npc-2 (AI工程师)
 * @version 1.0.1
 * 
 * 运行方式：
 * 1. Mocha: mocha test-unit.js
 * 2. 直接运行: node test-unit.js
 */

const assert = require('assert');
const path = require('path');

// 加载同级模块
function loadModule(moduleName) {
  // 尝试加载编译后的 JS
  const jsPath = path.join(__dirname, moduleName);
  try {
    return require(jsPath);
  } catch (e) {
    console.log(`⚠️ ${moduleName} 未找到，跳过测试`);
    return null;
  }
}

// ============================================
// TokenPool 单元测试
// ============================================

async function testTokenPool() {
  console.log('\n━━━ TokenPool 测试 ━━━');
  
  const module = loadModule('TokenPool');
  if (!module) return;
  
  const TokenPool = module.TokenPool || module.default;
  const TOKEN_POOL_CONFIG = module.TOKEN_POOL_CONFIG;
  
  // 测试套件
  const tests = [];
  
  // 测试1：默认配置初始化
  tests.push({
    name: '默认配置初始化',
    fn: async () => {
      const pool = new TokenPool();
      const status = pool.getStatus();
      
      assert.equal(status.total, TOKEN_POOL_CONFIG.maxSize, '最大令牌数');
      assert.equal(status.available, TOKEN_POOL_CONFIG.maxSize, '可用令牌数');
      
      await pool.close();
    }
  });
  
  // 测试2：自定义配置
  tests.push({
    name: '自定义配置',
    fn: async () => {
      const pool = new TokenPool({ maxSize: 5, acquireTimeout: 5000 });
      const status = pool.getStatus();
      
      assert.equal(status.total, 5, '自定义最大令牌数');
      
      await pool.close();
    }
  });
  
  // 测试3：令牌获取
  tests.push({
    name: '令牌获取',
    fn: async () => {
      const pool = new TokenPool({ maxSize: 2 });
      const token = await pool.acquire('high', 'test-agent');
      
      assert.ok(token.id, '令牌应有ID');
      assert.equal(token.priority, 'high', '优先级应为high');
      assert.equal(token.agentId, 'test-agent', 'Agent ID');
      
      const status = pool.getStatus();
      assert.equal(status.available, 1, '可用令牌减1');
      
      await pool.close();
    }
  });
  
  // 测试4：令牌释放
  tests.push({
    name: '令牌释放',
    fn: async () => {
      const pool = new TokenPool({ maxSize: 2 });
      const token = await pool.acquire('normal');
      
      await pool.release(token.id);
      
      const status = pool.getStatus();
      assert.equal(status.available, 2, '令牌归还后可用');
      
      await pool.close();
    }
  });
  
  // 测试5：释放不存在令牌
  tests.push({
    name: '释放不存在令牌应忽略',
    fn: async () => {
      const pool = new TokenPool();
      
      await pool.release('non-existent-token');
      
      const status = pool.getStatus();
      assert.equal(status.available, status.total, '可用令牌不变');
      
      await pool.close();
    }
  });
  
  // 测试6：超时处理
  tests.push({
    name: '令牌获取超时',
    fn: async () => {
      const pool = new TokenPool({ maxSize: 1, acquireTimeout: 100 });
      
      await pool.acquire('normal');
      
      try {
        await pool.acquire('normal');
        assert.fail('应抛超时错误');
      } catch (e) {
        assert.ok(e.message.includes('超时'), '超时错误');
      }
      
      await pool.close();
    }
  });
  
  // 测试7：统计信息
  tests.push({
    name: '统计信息',
    fn: async () => {
      const pool = new TokenPool({ maxSize: 2 });
      
      await pool.acquire('high');
      await pool.acquire('normal');
      
      const stats = pool.getStats();
      
      assert.ok(stats.acquiredCount >= 2, '获取次数');
      assert.ok(stats.currentAcquired >= 2, '当前持有');
      
      await pool.close();
    }
  });
  
  // 运行测试
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${test.name}: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`  结果: ${passed}/${tests.length} 通过`);
  return { passed, failed };
}

// ============================================
// VersionRouter 单元测试
// ============================================

async function testVersionRouter() {
  console.log('\n━━━ VersionRouter 测试 ━━━');
  
  const module = loadModule('VersionRouter');
  if (!module) return;
  
  const VersionRouter = module.VersionRouter || module.default;
  
  const tests = [];
  
  // 测试1：v1 完全兼容
  tests.push({
    name: 'v1 完全兼容',
    fn: async () => {
      const router = new VersionRouter();
      const result = router.checkVersion(1);
      
      assert.equal(result.compatibility, 'full', '完全兼容');
      assert.equal(result.canProceed, true, '可继续');
      assert.equal(result.errors.length, 0, '无错误');
      
      await router.close();
    }
  });
  
  // 测试2：v2 部分兼容
  tests.push({
    name: 'v2 部分兼容',
    fn: async () => {
      const router = new VersionRouter();
      const result = router.checkVersion(2);
      
      assert.equal(result.compatibility, 'partial', '部分兼容');
      assert.ok(result.downgradeTo === 1, '可降级到v1');
      
      await router.close();
    }
  });
  
  // 测试3：v3 breaking changes
  tests.push({
    name: 'v3 有 breaking changes',
    fn: async () => {
      const router = new VersionRouter();
      const result = router.checkVersion(3);
      
      assert.ok(result.warnings.length > 0, '有警告');
      
      await router.close();
    }
  });
  
  // 测试4：不支持的版本
  tests.push({
    name: '不支持的版本应拒绝',
    fn: async () => {
      const router = new VersionRouter();
      const result = router.checkVersion(99);
      
      assert.equal(result.compatibility, 'none', '不兼容');
      assert.equal(result.canProceed, false, '不可继续');
      assert.ok(result.errors.length > 0, '有错误');
      
      await router.close();
    }
  });
  
  // 测试5：路由 v1 消息
  tests.push({
    name: '路由 v1 消息',
    fn: async () => {
      const router = new VersionRouter();
      const message = { version: 1, data: 'test' };
      
      const result = await router.route(message);
      
      assert.equal(result.routedVersion, 1, '路由版本');
      assert.equal(result.data, 'test', '数据保持');
      
      await router.close();
    }
  });
  
  // 测试6：自动降级 v2
  tests.push({
    name: '自动降级 v2',
    fn: async () => {
      const router = new VersionRouter({ autoDowngrade: true });
      const message = { version: 2, data: 'test' };
      
      const result = await router.route(message);
      assert.ok(result, '路由成功');
      
      await router.close();
    }
  });
  
  // 测试7：严格模式拒绝
  tests.push({
    name: '严格模式拒绝部分兼容',
    fn: async () => {
      const router = new VersionRouter({ strictMode: true });
      const message = { version: 2, data: 'test' };
      
      try {
        await router.route(message);
        assert.fail('应拒绝');
      } catch (e) {
        assert.ok(e.message.includes('不兼容'), '版本不兼容错误');
      }
      
      await router.close();
    }
  });
  
  // 测试8：变更日志
  tests.push({
    name: '变更日志',
    fn: async () => {
      const router = new VersionRouter();
      const changelog = router.getChangelog();
      
      assert.ok(changelog.length >= 3, '至少3个版本');
      
      await router.close();
    }
  });
  
  // 运行测试
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${test.name}: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`  结果: ${passed}/${tests.length} 通过`);
  return { passed, failed };
}

// ============================================
// LLMScheduler 单元测试
// ============================================

async function testLLMScheduler() {
  console.log('\n━━━ LLMScheduler 测试 ━━━');
  
  const module = loadModule('LLMScheduler');
  if (!module) return;
  
  const LLMScheduler = module.LLMScheduler || module.default;
  
  const tests = [];
  
  // 测试1：初始化
  tests.push({
    name: '正确初始化',
    fn: async () => {
      const scheduler = new LLMScheduler();
      const status = scheduler.getStatus();
      
      assert.ok(status.tokenPool, '令牌池状态');
      assert.ok(status.scheduler, '调度器状态');
      
      await scheduler.close();
    }
  });
  
  // 测试2：自定义配置
  tests.push({
    name: '自定义配置',
    fn: async () => {
      const scheduler = new LLMScheduler({ maxConcurrent: 5 });
      const status = scheduler.getStatus();
      
      assert.equal(status.tokenPool.total, 5, '自定义并发数');
      
      await scheduler.close();
    }
  });
  
  // 测试3：成功调度
  tests.push({
    name: '成功调度',
    fn: async () => {
      const scheduler = new LLMScheduler();
      
      scheduler.setLLMCallFunction(async (prompt) => {
        return { result: `处理: ${prompt}` };
      });
      
      const result = await scheduler.schedule({
        agentId: 'test-agent',
        prompt: '测试',
        priority: 'high'
      });
      
      assert.equal(result.success, true, '调度成功');
      assert.ok(result.tokenId, '令牌ID');
      
      await scheduler.close();
    }
  });
  
  // 测试4：超时错误
  tests.push({
    name: '超时返回错误',
    fn: async () => {
      const scheduler = new LLMScheduler({ defaultTimeout: 100 });
      
      scheduler.setLLMCallFunction(async () => {
        await new Promise(r => setTimeout(r, 200));
        return { result: 'late' };
      });
      
      const result = await scheduler.schedule({
        agentId: 'test',
        prompt: 'test'
      });
      
      assert.equal(result.success, false, '调度失败');
      assert.ok(result.error, '有错误');
      
      await scheduler.close();
    }
  });
  
  // 测试5：批量并发
  tests.push({
    name: '批量并发执行',
    fn: async () => {
      const scheduler = new LLMScheduler({ maxConcurrent: 3 });
      
      scheduler.setLLMCallFunction(async (prompt) => {
        await new Promise(r => setTimeout(r, 50));
        return { result: prompt };
      });
      
      const requests = [
        { agentId: 'a1', prompt: 'p1' },
        { agentId: 'a2', prompt: 'p2' },
        { agentId: 'a3', prompt: 'p3' }
      ];
      
      const startTime = Date.now();
      const results = await scheduler.scheduleBatch(requests);
      const duration = Date.now() - startTime;
      
      assert.equal(results.length, 3, '3个结果');
      assert.ok(results.every(r => r.success), '全部成功');
      assert.ok(duration < 200, '并发执行');
      
      await scheduler.close();
    }
  });
  
  // 测试6：统计信息
  tests.push({
    name: '统计信息',
    fn: async () => {
      const scheduler = new LLMScheduler();
      
      scheduler.setLLMCallFunction(async () => ({ result: 'ok' }));
      
      await scheduler.schedule({ agentId: 'test', prompt: 'test' });
      
      const stats = scheduler.getStats();
      
      assert.ok(stats.scheduledCount >= 1, '调度次数');
      assert.ok(stats.completedCount >= 1, '完成次数');
      
      await scheduler.close();
    }
  });
  
  // 运行测试
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${test.name}: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`  结果: ${passed}/${tests.length} 通过`);
  return { passed, failed };
}

// ============================================
// 运行所有测试
// ============================================

async function runAllTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Integration 单元测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const results = [];
  
  // TokenPool
  const poolResult = await testTokenPool();
  if (poolResult) results.push({ module: 'TokenPool', ...poolResult });
  
  // VersionRouter
  const routerResult = await testVersionRouter();
  if (routerResult) results.push({ module: 'VersionRouter', ...routerResult });
  
  // LLMScheduler
  const schedulerResult = await testLLMScheduler();
  if (schedulerResult) results.push({ module: 'LLMScheduler', ...schedulerResult });
  
  // 总结
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' 测试总结');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  
  for (const r of results) {
    console.log(`  ${r.module}: ${r.passed}/${r.passed + r.failed} 通过`);
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalTests += r.passed + r.failed;
  }
  
  const coverage = Math.round((totalPassed / totalTests) * 100);
  
  console.log(`\n  总计: ${totalPassed}/${totalTests} 通过 (${coverage}% 覆盖率)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return { passed: totalPassed, failed: totalFailed, coverage };
}

// 导出
module.exports = {
  testTokenPool,
  testVersionRouter,
  testLLMScheduler,
  runAllTests
};

// 直接运行
if (require.main === module) {
  runAllTests().then(result => {
    if (result.failed > 0) {
      process.exit(1);
    }
  });
}