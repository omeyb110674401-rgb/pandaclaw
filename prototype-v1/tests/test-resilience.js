/**
 * PandaClaw 容错层测试
 * 
 * 负责人: cppcc-1（DevOps专家）
 */

const assert = require('assert');
const { 
  CircuitBreakerManager,
  RetryPolicy,
  RetryStrategies,
  DeadLetterQueue,
  HealthChecker,
  DependencyCheckers,
} = require('../src/resilience');

// Mock Redis Client
class MockRedisClient {
  constructor() {
    this.data = new Map();
    this.lists = new Map();
    this.streams = new Map();
  }
  
  async hset(key, field, value) {
    if (!this.data.has(key)) {
      this.data.set(key, new Map());
    }
    this.data.get(key).set(field, value);
    return 1;
  }
  
  async hget(key, field) {
    if (!this.data.has(key)) return null;
    return this.data.get(key).get(field);
  }
  
  async hgetall(key) {
    if (!this.data.has(key)) return {};
    const result = {};
    for (const [field, value] of this.data.get(key)) {
      result[field] = value;
    }
    return result;
  }
  
  async hdel(key, field) {
    if (!this.data.has(key)) return 0;
    return this.data.get(key).delete(field) ? 1 : 0;
  }
  
  async hlen(key) {
    if (!this.data.has(key)) return 0;
    return this.data.get(key).size;
  }
  
  async rpush(key, value) {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    this.lists.get(key).push(value);
    return this.lists.get(key).length;
  }
  
  async xadd(stream, id, ...args) {
    if (!this.streams.has(stream)) {
      this.streams.set(stream, []);
    }
    this.streams.get(stream).push({ id, fields: args });
    return id;
  }
  
  async ping() {
    return 'PONG';
  }
}

// ============================================
// 测试套件
// ============================================

async function runTests() {
  console.log('=== PandaClaw 容错层测试 ===\n');
  
  let passed = 0;
  let failed = 0;
  
  // ============================================
  // 熔断器测试
  // ============================================
  
  console.log('--- CircuitBreakerManager 测试 ---');
  
  try {
    const redis = new MockRedisClient();
    const manager = new CircuitBreakerManager(redis);
    
    // 测试创建熔断器
    const breaker = manager.create('test-service', async () => 'success');
    assert(breaker, '熔断器创建失败');
    
    // 测试调用
    const result = await manager.call('test-service');
    assert(result === 'success', '熔断器调用结果错误');
    
    // 测试状态获取
    const state = manager.getState('test-service');
    assert(state.state === 'closed', '初始状态应为 closed');
    
    console.log('✅ CircuitBreakerManager 基础测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ CircuitBreakerManager 基础测试失败: ${error.message}`);
    failed++;
  }
  
  // ============================================
  // 重试策略测试
  // ============================================
  
  console.log('\n--- RetryPolicy 测试 ---');
  
  try {
    const policy = new RetryPolicy();
    
    // 测试退避计算
    const delay0 = policy.calculateDelay(0);
    const delay1 = policy.calculateDelay(1);
    const delay2 = policy.calculateDelay(2);
    
    assert(delay0 > 0 && delay0 < 2000, '第一次退避延迟错误');
    assert(delay1 > delay0, '退避延迟应递增');
    assert(delay2 > delay1, '退避延迟应继续递增');
    
    console.log(`✅ 退避计算测试通过: ${delay0}ms -> ${delay1}ms -> ${delay2}ms`);
    passed++;
  } catch (error) {
    console.log(`❌ 退避计算测试失败: ${error.message}`);
    failed++;
  }
  
  try {
    const policy = new RetryPolicy({ maxRetries: 2 });
    
    // 测试成功执行
    const successResult = await policy.execute(async () => 'ok');
    assert(successResult === 'ok', '成功执行结果错误');
    
    // 测试失败后重试
    let attempts = 0;
    try {
      await policy.execute(async () => {
        attempts++;
        const err = new Error('Connection reset');
        err.code = 'ECONNRESET';  // 设置正确的 error.code
        throw err;
      });
    } catch (e) {
      // 预期失败
    }
    
    assert(attempts === 3, `重试次数应为3次（初始+2次重试），实际${attempts}次`);
    
    console.log('✅ 重试执行测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ 重试执行测试失败: ${error.message}`);
    failed++;
  }
  
  try {
    // 测试预定义策略
    assert(RetryStrategies.standard, 'standard 策略不存在');
    assert(RetryStrategies.llm, 'llm 策略不存在');
    assert(RetryStrategies.redis, 'redis 策略不存在');
    
    console.log('✅ 预定义策略测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ 预定义策略测试失败: ${error.message}`);
    failed++;
  }
  
  // ============================================
  // 死信队列测试
  // ============================================
  
  console.log('\n--- DeadLetterQueue 测试 ---');
  
  try {
    const redis = new MockRedisClient();
    const dlq = new DeadLetterQueue(redis);
    
    // 测试添加死信
    const dlqId = await dlq.add(
      { meetingId: 'test-1', eventType: 'test' },
      'timeout',
      3
    );
    assert(dlqId, '死信 ID 应存在');
    
    // 测试获取死信
    const entry = await dlq.get(dlqId);
    assert(entry, '死信应存在');
    assert(entry.failureReason === 'timeout', '失败原因错误');
    assert(entry.retryCount === 3, '重试次数错误');
    
    // 测试数量
    const count = await dlq.count();
    assert(count === 1, '死信数量应为1');
    
    console.log('✅ 死信队列基础测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ 死信队列基础测试失败: ${error.message}`);
    failed++;
  }
  
  try {
    const redis = new MockRedisClient();
    const dlq = new DeadLetterQueue(redis);
    
    // 添加死信
    const id1 = await dlq.add({ meetingId: 'test-1' }, 'error1', 1);
    const id2 = await dlq.add({ meetingId: 'test-2' }, 'error2', 2);
    
    // 测试获取所有
    const all = await dlq.getAll();
    assert(all.length === 2, '死信数量应为2');
    
    // 测试统计
    const stats = await dlq.getStats();
    assert(stats.total === 2, '统计总数应为2');
    
    console.log('✅ 死信队列统计测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ 死信队列统计测试失败: ${error.message}`);
    failed++;
  }
  
  // ============================================
  // 健康检查测试
  // ============================================
  
  console.log('\n--- HealthChecker 测试 ---');
  
  try {
    const redis = new MockRedisClient();
    const checker = new HealthChecker(redis);
    
    // 测试 Agent 注册
    await checker.registerAgent('test-agent', { role: 'test' });
    
    // 测试心跳
    await checker.receiveHeartbeat('test-agent', { status: 'ok' });
    
    // 测试健康检查
    const health = await checker.checkAgentHealth('test-agent');
    assert(health.healthy, 'Agent 应为健康状态');
    
    console.log('✅ Agent 健康检查测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ Agent 健康检查测试失败: ${error.message}`);
    failed++;
  }
  
  try {
    const redis = new MockRedisClient();
    const checker = new HealthChecker(redis);
    
    // 注册依赖
    checker.registerDependency('redis-test', {
      type: 'redis',
      checkFn: async () => { healthy: true },
      critical: true,
    });
    
    // 注册服务
    checker.registerService('test-service', async () => ({ healthy: true }));
    
    // 检查依赖
    const depHealth = await checker.checkDependency('redis-test');
    assert(depHealth, '依赖检查应有结果');
    
    console.log('✅ 依赖检查测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ 依赖检查测试失败: ${error.message}`);
    failed++;
  }
  
  try {
    // 测试预定义检查器
    const redis = new MockRedisClient();
    const redisChecker = DependencyCheckers.redis(redis);
    
    const result = await redisChecker();
    assert(result.healthy, 'Redis 应为健康状态');
    
    console.log('✅ 预定义检查器测试通过');
    passed++;
  } catch (error) {
    console.log(`❌ 预定义检查器测试失败: ${error.message}`);
    failed++;
  }
  
  // ============================================
  // 结果汇总
  // ============================================
  
  console.log('\n=== 测试结果 ===');
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 所有容错层测试通过！');
  } else {
    console.log(`\n⚠️ 有 ${failed} 个测试失败，请检查`);
  }
  
  return { passed, failed };
}

// ============================================
// 运行测试
// ============================================

runTests().catch(console.error);