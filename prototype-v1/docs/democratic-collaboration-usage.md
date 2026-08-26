# 民主式多Agent协作系统 - 使用指南

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                   民主式多Agent协作系统                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    Skill 层                              │  │
│   │  skills/democratic-collaboration/SKILL.md               │  │
│   │  • 七步闭环说明                                          │  │
│   │  • 与OpenClaw集成方式                                    │  │
│   │  • 使用示例                                              │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    API 层                                │  │
│   │  scripts/openclaw-democratic.js                         │  │
│   │  • collaborate(intent)                                   │  │
│   │  • spawnExecutor(task)                                   │  │
│   │  • spawnReviewer(task)                                   │  │
│   │  • voting(proposals)                                     │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    模块层                                │  │
│   │  scripts/democratic-collaboration-modules.js            │  │
│   │  • GoalAlignmentModule                                   │  │
│   │  • InformationSharingModule                              │  │
│   │  • RoleAssignmentModule                                  │  │
│   │  • CoordinationModule                                    │  │
│   │  • FeedbackLoopModule                                    │  │
│   │  • SupervisionModule                                     │  │
│   │  • ErrorCorrectionModule                                 │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                 OpenClaw 工具层                          │  │
│   │  • sessions_spawn → 派生子Agent                          │  │
│   │  • memory_search → 检索历史                              │  │
│   │  • memory_get → 获取记忆                                 │  │
│   │  • read/write → 文件操作                                 │  │
│   │  • message → 消息发送                                    │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 快速开始

### 方式1：直接使用（推荐）

在OpenClaw Agent中，直接描述协作需求：

```
用户：我需要开发一个用户登录功能，请使用民主式协作方式
```

Agent会自动：
1. 解析意图
2. 派生执行Agent
3. 派生评审Agent
4. 汇总结果

### 方式2：调用API

```javascript
const dc = require('./scripts/openclaw-democratic');

// 执行协作任务
const result = await dc.collaborate('开发用户登录功能');

// 查看执行步骤
console.log(result.steps);
```

### 方式3：分步执行

```javascript
const dc = require('./scripts/openclaw-democratic');

// 步骤1：解析意图
const goal = await dc.parseIntent('开发用户登录功能');

// 步骤2：派生执行Agent
const executor = await dc.spawnExecutor(
  '实现OAuth2.0登录',
  '开发用户登录功能'
);

// 步骤3：派生评审Agent
const reviewer = await dc.spawnReviewer(
  '评审登录功能',
  executor.result
);

// 步骤4：记录反馈
await dc.recordFeedback({
  agentId: 'executor-1',
  status: 'success',
  output: '登录功能已完成'
});
```

## 七步闭环详解

### 步骤1：目标对齐

**目的**：确保所有Agent对目标有共同理解

**工具调用**：
```
memory_search({ query: "类似任务", maxResults: 5 })
```

**检查清单**：
- [ ] 意图理解置信度 >= 0.8
- [ ] 成功标准可量化
- [ ] 约束条件明确
- [ ] 目标文档已生成

**输出**：目标文档（存储到 memory/YYYY-MM-DD-goal.md）

---

### 步骤2：信息共享

**目的**：确保所有Agent获得完整上下文

**工具调用**：
```
read({ path: "USER.md" })
read({ path: "AGENTS.md" })
read({ path: "SOUL.md" })
```

**检查清单**：
- [ ] 任务背景已提供
- [ ] 相关历史已检索
- [ ] 用户偏好已注入
- [ ] 上下文包已构建

**输出**：上下文包（通过 task 参数传递给子Agent）

---

### 步骤3：角色分工

**目的**：合理分配Agent角色和职责

**角色分配模板**：

| 任务类型 | 角色分配 |
|---------|---------|
| simple | coordinator + executor |
| complex | coordinator + executor + reviewer |
| collaborative | coordinator + 2*executor + 2*reviewer + supervisor |

**工具调用**：
```
sessions_spawn({
  task: "执行任务...",
  runtime: "subagent",
  mode: "run",
  label: "executor-1"
})
```

**检查清单**：
- [ ] 角色已定义
- [ ] 分工合理
- [ ] 权限明确
- [ ] 协作关系清晰

---

### 步骤4：协调机制

**目的**：建立Agent间的协调和决策机制

**决策模式选择**：
```
任务重要性？
├── 高 → 升级用户决策
├── 中 + 冲突高 → 投票决策（≥3个Agent）
├── 中 + 冲突低 → 单点决策
└── 低 → 自动决策
```

**投票决策示例**：
```javascript
const dc = require('./scripts/openclaw-democratic');

const result = await dc.voting([
  '方案A：使用微信SDK',
  '方案B：使用支付宝SDK'
], 3);
```

**检查清单**：
- [ ] 协调模式已确定
- [ ] 通信协议已建立
- [ ] 决策机制已明确

---

### 步骤5：反馈闭环

**目的**：记录执行结果，持续改进

**工具调用**：
```
write({
  path: "memory/2026-03-24-feedback.md",
  content: "## 反馈记录\n\n..."
})
```

**检查清单**：
- [ ] 反馈渠道畅通
- [ ] 反馈及时
- [ ] 反馈有效
- [ ] 形成闭环

---

### 步骤6：监督制衡

**目的**：防止错误累积，设置否决权

**一票否决触发条件**：
- 安全风险
- 合规违规
- 权限越界
- 资源超限

**使用示例**：
```javascript
const dc = require('./scripts/openclaw-democratic');

// 行使否决权
if (hasSecurityRisk) {
  return dc.veto('检测到安全风险', 'reviewer-1');
}
```

**检查清单**：
- [ ] 监督机制建立
- [ ] 制衡机制建立
- [ ] 否决权有效

---

### 步骤7：纠错机制

**目的**：错误检测、分类、修复

**错误级别处理**：
| 级别 | 处理方式 |
|------|---------|
| fatal | 停止 + 人工介入 + 回滚 |
| severe | 暂停 + 尝试修复 |
| general | 重试（指数退避）|
| minor | 记录 + 继续 |

**检查清单**：
- [ ] 错误检测及时
- [ ] 错误处理规范
- [ ] 纠错能力具备

---

## 配置说明

### openclaw.json

```json
{
  "democratic": {
    "enabled": true,
    "thresholds": {
      "intentConfidence": 0.8,
      "proposalCount": 2,
      "voterCount": 3,
      "qualityScore": 0.8
    },
    "roles": {
      "coordinator": ["planner"],
      "executor": ["executor", "live-ops", "browser"],
      "reviewer": ["reviewer"]
    }
  }
}
```

### 关键阈值

| 阈值 | 默认值 | 说明 |
|------|--------|------|
| intentConfidence | 0.8 | 意图理解置信度 |
| proposalCount | 2 | 最小方案数量 |
| voterCount | 3 | 最小投票Agent数量 |
| qualityScore | 0.8 | 质量评分阈值 |

---

## 文件结构

```
workspace/
├── skills/
│   └── democratic-collaboration/
│       └── SKILL.md                    # 技能文档
├── scripts/
│   ├── openclaw-democratic.js          # 简化API
│   ├── democratic-collaboration-modules.js  # 模块化实现
│   └── democratic-collaboration.js     # 完整实现
├── memory/
│   ├── YYYY-MM-DD-goal.md              # 目标文档
│   ├── YYYY-MM-DD-feedback.md          # 反馈记录
│   └── subagent-feedback/              # 反馈系统
└── openclaw.json                       # 配置文件
```

---

## 与OpenClaw原生功能的关系

| 民主协作功能 | OpenClaw原生工具 | 说明 |
|-------------|-----------------|------|
| 派生Agent | `sessions_spawn` | 使用OpenClaw的子Agent机制 |
| 记忆检索 | `memory_search` | 使用OpenClaw的记忆系统 |
| 记忆获取 | `memory_get` | 使用OpenClaw的记忆系统 |
| 文件操作 | `read/write` | 使用OpenClaw的文件工具 |
| 消息发送 | `message` | 使用OpenClaw的消息工具 |
| 技能系统 | `skills/` | 作为OpenClaw Skill存在 |

---

_创建时间: 2026-03-24_
_版本: 2.0 (模块化集成版)_