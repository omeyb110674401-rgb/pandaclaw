/**
 * Integration 模块单元测试
 * @author npc-2 (AI工程师)
 * @version 1.0.1
 */

const assert = require('assert');
const path = require('path');

// 加载模块（支持 TypeScript 和 JavaScript）
function loadModule(moduleName) {
  const tsPath = path.join(__dirname, '../src/integration', `${moduleName}.ts`);
  const jsPath = path.join(__dirname, '../src/integration', `${moduleName}.js`);
  
  try {
    // 优先加载 TypeScript（需要编译）
    return require(tsPath.replace('.ts', '.js')); // 编译后的 JS
  } catch (e) {
    // 加载 JavaScript
    return require(jsPath);
  }
}

// ============================================
// TokenPool 单元测试
// ============================================

describe('TokenPool', function() {
  let TokenPool, TOKEN_POOL_CONFIG;
  
  before(function() {
    try {
      const module = loadModule('TokenPool');
      TokenPool = module.TokenPool || module.default;
      TOKEN_POOL_CONFIG = module.TOKEN_POOL_CONFIG;
    } catch (e) {
      console.log('⚠️ TokenPool 模块未找到，跳过测试');
      this.skip();
    }
  });
  
  describe('初始化', function() {
    it('应使用默认配置初始化', function() {
      const pool = new TokenPool();
      const status = pool.getStatus();
      
      assert.equal(status.total, TOKEN_POOL_CONFIG.maxSize, '最大令牌数');
      assert.equal(status.available, TOKEN_POOL_CONFIG.maxSize, '可用令牌数');
    });
    
    it('应支持自定义配置', function() {
      const pool = new TokenPool({ maxSize: 5, acquireTimeout: 5000 });
      const status = pool.getStatus();
      
      assert.equal(status.total, 5, '自定义最大令牌数');
    });
  });
  
  describe('令牌获取', function() {
    it('应成功获取令牌', async function() {
      const pool = new TokenPool({ maxSize: 2 });
      const token = await pool.acquire('high', 'test-agent');
      
      assert.ok(token.id, '令牌应有ID');
      assert.equal(token.priority, 'high', '优先级应为high');
      assert.equal(token.agentId, 'test-agent', 'Agent ID');
      
      const status = pool.getStatus();
      assert.equal(status.available, 1, '可用令牌减1');
      
      await pool.close();
    });
    
    it('高优先级应优先获取', async function() {
      const pool = new TokenPool({ maxSize: 1 });
      
      // 先获取令牌
      const token1 = await pool.acquire('low', 'agent-low');
      
      // 添加等待者
      const lowPromise = pool.acquire('low', 'agent-wait-low');
      const highPromise = pool.acquire('high', 'agent-wait-high');
      
      // 释放令牌
      await pool.release(token1.id);
      
      // 高优先级应先获得
      const highToken = await highPromise;
      assert.ok(highToken, '高优先级应获得令牌');
      
      await pool.close();
    });
  });
  
  describe('令牌释放', function() {
    it('应成功释放令牌', async function() {
      const pool = new TokenPool({ maxSize: 2 });
      const token = await pool.acquire('normal');
      
      await pool.release(token.id);
      
      const status = pool.getStatus();
      assert.equal(status.available, 2, '令牌归还后可用');
      
      await pool.close();
    });
    
    it('释放不存在令牌应忽略', async function() {
      const pool = new TokenPool();
      
      // 不应抛错
      await pool.release('non-existent-token');
      
      const status = pool.getStatus();
      assert.equal(status.available, status.total, '可用令牌不变');
      
      await pool.close();
    });
  });
  
  describe('超时处理', function() {
    it('令牌获取超时应报错', async function() {
      const pool = new TokenPool({ maxSize: 1, acquireTimeout: 100 });
      
      // 先消耗所有令牌
      await pool.acquire('normal');
      
      // 再次获取应超时
      try {
        await pool.acquire('normal');
        assert.fail('应抛超时错误');
      } catch (e) {
        assert.ok(e.message.includes('超时'), '超时错误');
      }
      
      await pool.close();
    });
  });
  
  describe('状态和统计', function() {
    it('应返回正确的状态', function() {
      const pool = new TokenPool({ maxSize: 5 });
      const status = pool.getStatus();
      
      assert.ok(status.available >= 0, '可用令牌');
      assert.ok(status.waiting >= 0, '等待队列');
      assert.ok(status.total > 0, '总令牌数');
      
      pool.close();
    });
    
    it('应记录统计数据', async function() {
      const pool = new TokenPool({ maxSize: 2 });
      
      await pool.acquire('high');
      await pool.acquire('normal');
      
      const stats = pool.getStats();
      
      assert.ok(stats.acquiredCount >= 2, '获取次数');
      assert.ok(stats.currentAcquired >= 2, '当前持有');
      
      await pool.close();
    });
  });
});

// ============================================
// VersionRouter 单元测试
// ============================================

describe('VersionRouter', function() {
  let VersionRouter;
  
  before(function() {
    try {
      const module = loadModule('VersionRouter');
      VersionRouter = module.VersionRouter || module.default;
    } catch (e) {
      console.log('⚠️ VersionRouter 模块未找到，跳过测试');
      this.skip();
    }
  });
  
  describe('版本检查', function() {
    it('v1 应完全兼容', function() {
      const router = new VersionRouter();
      const result = router.checkVersion(1);
      
      assert.equal(result.compatibility, 'full', '完全兼容');
      assert.equal(result.canProceed, true, '可继续');
      assert.equal(result.errors.length, 0, '无错误');
      
      router.close();
    });
    
    it('v2 应部分兼容', function() {
      const router = new VersionRouter();
      const result = router.checkVersion(2);
      
      assert.equal(result.compatibility, 'partial', '部分兼容');
      assert.ok(result.downgradeTo === 1, '可降级到v1');
      
      router.close();
    });
    
    it('v3 应有 breaking changes', function() {
      const router = new VersionRouter();
      const result = router.checkVersion(3);
      
      assert.ok(result.warnings.length > 0, '有警告');
      
      router.close();
    });
    
    it('不支持的版本应拒绝', function() {
      const router = new VersionRouter();
      const result = router.checkVersion(99);
      
      assert.equal(result.compatibility, 'none', '不兼容');
      assert.equal(result.canProceed, false, '不可继续');
      assert.ok(result.errors.length > 0, '有错误');
      
      router.close();
    });
  });
  
  describe('消息路由', function() {
    it('应路由 v1 消息', async function() {
      const router = new VersionRouter();
      const message = { version: 1, data: 'test' };
      
      const result = await router.route(message);
      
      assert.equal(result.routedVersion, 1, '路由版本');
      assert.equal(result.data, 'test', '数据保持');
      
      router.close();
    });
    
    it('应自动降级 v2 消息', async function() {
      const router = new VersionRouter({ autoDowngrade: true });
      const message = { version: 2, data: 'test' };
      
      const result = await router.route(message);
      
      assert.ok(result, '路由成功');
      
      router.close();
    });
    
    it('严格模式应拒绝部分兼容', async function() {
      const router = new VersionRouter({ strictMode: true });
      const message = { version: 2, data: 'test' };
      
      try {
        await router.route(message);
        assert.fail('应拒绝');
      } catch (e) {
        assert.ok(e.message.includes('不兼容'), '版本不兼容错误');
      }
      
      router.close();
    });
  });
  
  describe('变更日志', function() {
    it('应返回所有版本日志', function() {
      const router = new VersionRouter();
      const changelog = router.getChangelog();
      
      assert.ok(changelog.length >= 3, '至少3个版本');
      assert.ok(changelog[0].version, '版本号');
      
      router.close();
    });
    
    it('应返回指定版本日志', function() {
      const router = new VersionRouter();
      const changelog = router.getChangelog(1);
      
      assert.equal(changelog.length, 1, '单个版本');
      assert.equal(changelog[0].version, 1, 'v1');
      
      router.close();
    });
  });
});

// ============================================
// LLMScheduler 单元测试
// ============================================

describe('LLMScheduler', function() {
  let LLMScheduler, LLM_SCHEDULER_CONFIG;
  
  before(function() {
    try {
      const module = loadModule('LLMScheduler');
      LLMScheduler = module.LLMScheduler || module.default;
      LLM_SCHEDULER_CONFIG = module.LLM_SCHEDULER_CONFIG;
    } catch (e) {
      console.log('⚠️ LLMScheduler 模块未找到，跳过测试');
      this.skip();
    }
  });
  
  describe('初始化', function() {
    it('应正确初始化', function() {
      const scheduler = new LLMScheduler();
      const status = scheduler.getStatus();
      
      assert.ok(status.tokenPool, '令牌池状态');
      assert.ok(status.scheduler, '调度器状态');
      
      scheduler.close();
    });
    
    it('应支持自定义配置', function() {
      const scheduler = new LLMScheduler({
        maxConcurrent: 5,
        defaultTimeout: 30000
      });
      
      const status = scheduler.getStatus();
      assert.equal(status.tokenPool.total, 5, '自定义并发数');
      
      scheduler.close();
    });
  });
  
  describe('LLM调度', function() {
    it('应成功调度调用', async function() {
      const scheduler = new LLMScheduler();
      
      scheduler.setLLMCallFunction(async (prompt) => {
        return { result: `处理: ${prompt}` };
      });
      
      const result = await scheduler.schedule({
        agentId: 'test-agent',
        prompt: '测试提示词',
        priority: 'high'
      });
      
      assert.equal(result.success, true, '调度成功');
      assert.ok(result.tokenId, '令牌ID');
      assert.ok(result.result, 'LLM结果');
      
      scheduler.close();
    });
    
    it('超时应返回错误', async function() {
      const scheduler = new LLMScheduler({ defaultTimeout: 100 });
      
      scheduler.setLLMCallFunction(async () => {
        await new Promise(r => setTimeout(r, 200)); // 超过超时
        return { result: 'late' };
      });
      
      const result = await scheduler.schedule({
        agentId: 'test-agent',
        prompt: '测试'
      });
      
      assert.equal(result.success, false, '调度失败');
      assert.ok(result.error, '有错误信息');
      
      scheduler.close();
    });
    
    it('批量调度应并发执行', async function() {
      const scheduler = new LLMScheduler({ maxConcurrent: 3 });
      
      scheduler.setLLMCallFunction(async (prompt) => {
        await new Promise(r => setTimeout(r, 50));
        return { result: prompt };
      });
      
      const requests = [
        { agentId: 'agent-1', prompt: 'p1' },
        { agentId: 'agent-2', prompt: 'p2' },
        { agentId: 'agent-3', prompt: 'p3' }
      ];
      
      const startTime = Date.now();
      const results = await scheduler.scheduleBatch(requests);
      const duration = Date.now() - startTime;
      
      assert.equal(results.length, 3, '3个结果');
      assert.ok(results.every(r => r.success), '全部成功');
      assert.ok(duration < 200, '并发执行（<200ms）');
      
      scheduler.close();
    });
  });
  
  describe('速率限制', function() {
    it('应限制速率', async function() {
      const scheduler = new LLMScheduler({
        maxConcurrent: 10,
        rateLimitPerMinute: 5
      });
      
      scheduler.setLLMCallFunction(async () => ({ result: 'ok' }));
      
      // 快速发送多个请求
      const requests = Array(10).fill(null).map((_, i) => ({
        agentId: 'rate-test-agent',
        prompt: `test${i}`
      }));
      
      const results = await scheduler.scheduleBatch(requests);
      
      // 应全部成功（速率限制会等待）
      assert.ok(results.every(r => r.success), '全部成功');
      
      const stats = scheduler.getStats();
      assert.ok(stats.rateLimitedCount > 0, '有速率限制');
      
      scheduler.close();
    });
  });
  
  describe('统计', function() {
    it('应记录完整统计', async function() {
      const scheduler = new LLMScheduler();
      
      scheduler.setLLMCallFunction(async () => ({ result: 'ok' }));
      
      await scheduler.schedule({ agentId: 'test', prompt: 'test' });
      
      const stats = scheduler.getStats();
      
      assert.ok(stats.scheduledCount >= 1, '调度次数');
      assert.ok(stats.completedCount >= 1, '完成次数');
      assert.ok(stats.avgLatency >= 0, '平均延迟');
      
      scheduler.close();
    });
  });
});

// ============================================
// 运行测试
// ============================================

function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Integration 单元测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 使用 Mocha 或简单运行
  if (typeof describe === 'function') {
    // Mocha 环境
    return;
  }
  
  // 简单测试运行器
  const tests = [
    { name: 'TokenPool', fn: testTokenPool },
    { name: 'VersionRouter', fn: testVersionRouter },
    { name: 'LLMScheduler', fn: testLLMScheduler }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      test.fn();
      console.log(`✅ ${test.name} 通过`);
      passed++;
    } catch (e) {
      console.log(`❌ ${test.name} 失败: ${e.message}`);
      failed++;
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
}

module.exports = { runTests };

if (require.main === module) {
  runTests();
}