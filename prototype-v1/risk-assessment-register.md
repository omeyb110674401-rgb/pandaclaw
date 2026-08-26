# PandaClaw 风险评估清单

> 项目：PandaClaw 独立系统建设 + UI 开发
> 方案：消息队列 + 事件驱动（方案B）
> 评估日期：2026-03-27
> 评估者：cppcc-3（风险评估师）

---

## 风险等级定义

| 等级 | 分数范围 | 说明 | 行动要求 |
|------|----------|------|----------|
| 🔴 Critical | 20-25 | 立即行动 | 24小时内制定缓解计划 |
| 🟠 High | 15-19 | 高优先级 | 7天内制定缓解计划 |
| 🟡 Medium | 8-14 | 中等风险 | 每月监控审查 |
| 🟢 Low | 1-7 | 低风险 | 季度审查或接受 |

---

## 风险登记表

### 一、架构风险类

| # | 风险 | 类别 | L | I | Score | Priority | 缓解措施 | 负责人 | 截止日期 |
|---|------|------|---|---|-------|----------|----------|--------|----------|
| R1 | Redis Streams迁移导致服务中断 | Technical | 3 | 4 | 12 | 🟡 Medium | 灰度开关 + 回滚机制 + 适配器并存 | DevOps | 开发阶段 |
| R2 | PandaClaw崩溃拖垮OpenClaw | Operational | 4 | 5 | 20 | 🔴 Critical | 熔断机制 + 沙箱隔离 + 超时降级 | 架构师 | P0 |
| R3 | 共享进程导致版本兼容冲突 | Technical | 3 | 3 | 9 | 🟡 Medium | 适配层版本化 + 接口签名验证 + 降级策略 | 后端 | 开发阶段 |
| R4 | 依赖边界不清晰导致耦合风险 | Technical | 3 | 4 | 12 | 🟡 Medium | 明确依赖清单 + 版本锁定 + 兼容性测试 | 架构师 | 设计阶段 |

### 二、并发性能风险类

| # | 风险 | 类别 | L | I | Score | Priority | 缓解措施 | 负责人 | 截止日期 |
|---|------|------|---|---|-------|----------|----------|--------|----------|
| R5 | EventEmitter单进程瓶颈 | Technical | 4 | 3 | 12 | 🟡 Medium | 升级Redis Streams + 预留扩展点 | 后端 | P1 |
| R6 | LLM并发调用无公平调度 | Operational | 4 | 4 | 16 | 🟠 High | 令牌池 + 优先级队列 + 超时控制 | AI工程师 | P0 |
| R7 | 10+Agent并发会话资源耗尽 | Operational | 3 | 4 | 12 | 🟡 Medium | 并发限制 + 资源监控 + 降级策略 | DevOps | P1 |

### 三、接口稳定性风险类

| # | 风险 | 类别 | L | I | Score | Priority | 缓解措施 | 负责人 | 截止日期 |
|---|------|------|---|---|-------|----------|----------|--------|----------|
| R8 | sessions_send接口变更导致适配层失效 | Technical | 3 | 4 | 12 | 🟡 Medium | 接口版本化 + 兼容层 + 变更通知机制 | 后端 | 设计阶段 |
| R9 | 消息队列配置错误导致消息丢失 | Operational | 3 | 5 | 15 | 🟠 High | ACK确认 + WAL日志 + 重试机制 | DevOps | P0 |
| R10 | 消息重复处理导致数据不一致 | Technical | 3 | 4 | 12 | 🟡 Medium | 消息ID去重 + TTL缓存 + 幂等设计 | 后端 | 开发阶段 |

### 四、质量保障风险类

| # | 风险 | 类别 | L | I | Score | Priority | 缓解措施 | 负责人 | 截止日期 |
|---|------|------|---|---|-------|----------|----------|--------|----------|
| R11 | 会议中断无法恢复状态 | Operational | 3 | 3 | 9 | 🟡 Medium | 状态持久化 + 快照机制 + 恢复接口 | 后端 | P1 |
| R12 | 无质量验收标准导致交付质量不可控 | Quality | 4 | 3 | 12 | 🟡 Medium | 定义验收指标 + 自动化测试 + CI门禁 | QA | P0 |

### 五、安全风险类

| # | 风险 | 类别 | L | I | Score | Priority | 缓解措施 | 负责人 | 截止日期 |
|---|------|------|---|---|-------|----------|----------|--------|----------|
| R13 | 消息队列未加密导致数据泄露 | Security | 2 | 5 | 10 | 🟡 Medium | TLS加密 + 认证机制 | 安全 | 开发阶段 |
| R14 | UI未做权限控制导致未授权访问 | Security | 3 | 4 | 12 | 🟡 Medium | JWT认证 + RBAC权限 | 前端 | UI开发阶段 |

### 六、运维风险类

| # | 风险 | 类别 | L | I | Score | Priority | 缓解措施 | 负责人 | 截止日期 |
|---|------|------|---|---|-------|----------|----------|--------|----------|
| R15 | Redis故障导致会议系统不可用 | Operational | 2 | 5 | 10 | 🟡 Medium | Redis集群 + 降级到内存模式 | DevOps | P2 |
| R16 | 无监控告警导致故障发现延迟 | Operational | 4 | 3 | 12 | 🟡 Medium | 监控Dashboard + 关键指标告警 | DevOps | P1 |

---

## 风险热力图

```
           Impact
         1    2    3    4    5
    ┌────┬────┬────┬────┬────┐
 5  │    │    │    │    │ R2 │ 🔴
    ├────┼────┼────┼────┼────┤
 4  │    │    │    │ R1 │ R9 │ 🟠
    │    │    │    │ R4 │ R10│
    │    │    │    │ R8 │ R14│
    │    │    │ R6 │    │    │
    ├────┼────┼────┼────┼────┤
 3  │    │    │ R3 │ R5 │    │ 🟡
    │    │    │ R11│ R7 │    │
    │    │    │ R12│    │    │
    │    │    │ R16│    │    │
    ├────┼────┼────┼────┼────┤
 2  │    │    │    │    │ R13│ 🟢
    │    │    │    │    │ R15│
    ├────┼────┼────┼────┼────┤
 1  │    │    │    │    │    │
    └────┴────┴────┴────┴────┘
L
```

---

## 关键风险摘要

### 🔴 Critical（立即行动）

**R2: PandaClaw崩溃拖垮OpenClaw**
- 评分：L4 × I5 = 20
- 影响：OpenClaw核心功能不可用，用户无法使用主系统
- 缓解措施：
  1. 熔断机制：异常率>50%自动熔断
  2. 沙箱隔离：try-catch包裹所有PandaClaw操作
  3. 超时降级：30秒超时自动降级到基础模式
- 负责人：系统架构师（npc-1）
- 截止日期：P0

---

### 🟠 High（7天内制定缓解计划）

**R6: LLM并发调用无公平调度**
- 评分：L4 × I4 = 16
- 影响：部分Agent响应延迟，用户体验差
- 缓解措施：
  1. 令牌池：限制同时并发LLM调用数量
  2. 优先级队列：关键会议优先处理
  3. 超时控制：单次调用超时自动取消

**R9: 消息队列配置错误导致消息丢失**
- 评分：L3 × I5 = 15
- 影响：会议状态丢失，决策无法恢复
- 缓解措施：
  1. ACK确认机制
  2. WAL日志持久化
  3. 重试机制（3次）

---

## 风险控制措施验收清单

| # | 控制措施 | 验收标准 | 验收方法 | 状态 | 实现位置 |
|---|----------|----------|----------|------|----------|
| C1 | 熔断机制 | PandaClaw崩溃不影响OpenClaw | 故障注入测试 | ⏳ 待开发 | resilience/CircuitBreaker |
| C2 | 消息确认机制 | 消息零丢失 | 压力测试 | ✅ 已实现 | MessageAdapter.ack() |
| C3 | 去重机制 | 去重率100% | 并发测试 | ✅ 已实现 | MessageAdapter.dedupCache |
| C4 | 状态恢复 | 中断后可恢复 | 故障恢复测试 | ✅ 已实现 | StateManager.snapshot + checksum |
| C5 | 版本兼容 | 升级后功能正常 | 兼容性测试 | ✅ 已实现 | CONTRACT_VERSION=1 |
| C6 | 并发控制 | 10+Agent并发无阻塞 | 并发压力测试 | ⏳ 待开发 | integration/TokenPool |
| C7 | WAL日志 | 写前日志保证持久性 | 故障恢复测试 | ✅ 已实现 | StateManager.walEnabled |
| C8 | 重试机制 | 失败自动重试3次 | 错误注入测试 | ✅ 已设计 | messages.ts RETRY.maxRetries=3 |
| C9 | 死信队列 | 失败消息不丢失 | 消息追踪测试 | ⏳ 待开发 | resilience/DeadLetterQueue |
| C10 | 快照校验 | checksum验证完整性 | 数据完整性测试 | ✅ 已实现 | StateManager.verifySnapshot() |

---

## 契约审核结果

### events.ts 审核

| 设计元素 | 风险控制 | 评估 |
|----------|----------|------|
| CircuitBreakerEvent | 熔断器状态定义 | ✅ 完善 |
| state: 'closed'/'open'/'half-open' | 状态机设计 | ✅ 符合熔断器规范 |
| failureCount + lastFailure | 故障追踪 | ✅ 完整 |
| DeadLetterEvent | 死信事件定义 | ✅ 完整 |
| correlationId | 请求追踪 | ✅ 支持去重 |

### messages.ts 审核

| 设计元素 | 风险控制 | 评估 |
|----------|----------|------|
| MESSAGE_TTL=24h | 消息过期清理 | ✅ 防止积压 |
| RETRY.maxRetries=3 | 重试机制 | ✅ 已实现 |
| backoff='exponential' | 退避策略 | ✅ 避免雪崩 |
| ACK机制 | 消息确认 | ✅ MessageAdapter.ack() |
| 去重缓存 | dedupCache | ✅ 内存去重 |
| TokenPool配置 | 令牌池定义 | ✅ 已设计，待实现 |

### state.ts 审核

| 设计元素 | 风险控制 | 评估 |
|----------|----------|------|
| MeetingState.checksum | 状态完整性 | ✅ 已实现 |
| StateSnapshot | 崩溃恢复 | ✅ StateManager.createSnapshot() |
| ErrorCode枚举 | 错误标准化 | ✅ 完整覆盖 |
| WAL模式 | 写前日志 | ✅ SQLite WAL |
| 缓存TTL=30s | 缓存过期 | ✅ 防止内存溢出 |

---

## 模块风险评估

### 已实现模块

| 模块 | 文件 | 风险控制 | 验收状态 |
|------|------|----------|----------|
| MessageAdapter | messaging/MessageAdapter.js | ACK+去重+重试 | ✅ 通过 |
| StateManager | core/StateManager.js | WAL+快照+checksum | ✅ 通过 |
| FastPath | messaging/MessageAdapter.js | 进程内即时发送 | ✅ 通过 |
| ReliablePath | messaging/MessageAdapter.js | BullMQ持久化 | ⚠️ 需Redis |

### 待开发模块

| 模块 | 文件 | 风险控制 | 优先级 |
|------|------|----------|--------|
| CircuitBreaker | resilience/CircuitBreaker.js | 熔断隔离 | 🔴 Critical |
| TokenPool | integration/TokenPool.js | LLM并发控制 | 🟠 High |
| DeadLetterQueue | resilience/DeadLetterQueue.js | 失败消息追踪 | 🟡 Medium |
| HealthChecker | resilience/HealthChecker.js | 健康检查 | 🟡 Medium |
| MetricsCollector | observability/MetricsCollector.js | 监控指标 | 🟢 Low |

---

## 关键风险更新

### R2: PandaClaw崩溃拖垮OpenClaw

**当前状态：** 🔴 Critical - 熔断机制未实现

**控制措施设计：**
```typescript
// contracts/events.ts 已定义
interface CircuitBreakerEvent {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure?: { error: string; timestamp: number };
}
```

**建议实现：**
- 使用opossum库实现熔断器
- 错误阈值：50%（3次失败/6次调用）
- 超时：30秒
- 半开状态恢复：60秒后尝试1次

**验收测试：**
```javascript
// 故障注入测试
await circuitBreaker.fire(); // 正常
await injectFailure(); // 模拟崩溃
assert(circuitBreaker.state === 'open'); // 熔断生效
assert(openClawStillRunning()); // OpenClaw不受影响
```

---

### R6: LLM并发调用无公平调度

**当前状态：** 🟠 High - TokenPool已设计但未实现

**控制措施设计：**
```typescript
// contracts/messages.ts 已定义
const TOKEN_POOL_CONFIG = {
  maxSize: 10,
  acquireTimeout: 30000,
  priorityLevels: 3
};
```

**建议实现：**
- 令牌池：Semaphore模式
- 优先级队列：high/normal/low
- 超时机制：30秒获取超时
- 公平调度：FIFO + 优先级加权

---

### R9: 消息队列配置错误导致消息丢失

**当前状态：** ✅ 已缓解 - ACK+重试已实现

**控制措施实现：**
- ACK确认：MessageAdapter.ack()
- 重试机制：maxRetries=3, exponential backoff
- 去重缓存：dedupCache (60秒TTL)

**剩余风险：**
- 死信队列未实现，失败消息无法追踪
- 建议实现DeadLetterQueue存储最终失败消息

---

## 质量验收标准

| 维度 | 指标 | 目标值 | 验收方法 |
|------|------|--------|----------|
| 消息可靠性 | 消息零丢失 | 100% | WAL日志 + ACK确认 |
| 消息一致性 | 去重率 | 100% | 消息ID缓存 |
| 故障隔离 | PandaClaw崩溃影响 | 0 | 熔断测试 |
| 可恢复性 | 会议恢复成功率 | 100% | 状态快照 |
| 并发性能 | 10+Agent响应时间 | <30s | 压力测试 |
| 安全性 | 数据传输加密 | TLS 1.2+ | 安全审计 |

---

## 后续行动

1. **P0阶段**：优先解决R2（熔断机制）和R9（消息确认）
2. **设计阶段**：明确依赖边界（R4）、接口版本化（R8）
3. **开发阶段**：实施所有缓解措施
4. **验收阶段**：逐一验证控制措施有效性

---

_风险评估师：cppcc-3_
_评估日期：2026-03-27_