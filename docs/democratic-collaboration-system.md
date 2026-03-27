# 民主式多Agent协作系统

## 概述

基于七步协作闭环的多Agent协作系统，模仿中国全过程人民民主的协作机制。

## 七步协作闭环

```
目标对齐 → 信息共享 → 角色分工 → 协调机制 → 反馈闭环 → 监督制衡 → 纠错机制
   ↑                                                              ↓
   └──────────────────── 持续改进循环 ←───────────────────────────┘
```

## 快速开始

### 1. 基本使用

```javascript
const { quickRun } = require('./scripts/openclaw-democratic-integration');

// 执行民主式协作任务
const result = await quickRun('开发一个用户登录功能');
console.log(result);
```

### 2. 查看系统状态

```javascript
const { checkStatus } = require('./scripts/openclaw-democratic-integration');

const status = await checkStatus();
console.log(status);
```

### 3. 验证闭环完整性

```javascript
const { validateLoop } = require('./scripts/openclaw-democratic-integration');

const validation = await validateLoop();
console.log(validation);
```

## CLI 使用

```bash
# 执行任务
node scripts/openclaw-democratic-integration.js run "开发用户登录功能"

# 查看状态
node scripts/openclaw-democratic-integration.js status

# 验证闭环
node scripts/openclaw-democratic-integration.js validate
```

## 核心模块

### 1. GoalAlignment（目标对齐）

```javascript
const { GoalAlignment } = require('./scripts/democratic-collaboration');

const ga = new GoalAlignment();
const result = await ga.parseIntent('开发一个用户登录功能');

// 检查置信度
if (result.needsClarification) {
  // 需要用户澄清
}

// 生成目标文档
const goalDoc = ga.generateGoalDocument();
```

### 2. InformationSharing（信息共享）

```javascript
const { InformationSharing } = require('./scripts/democratic-collaboration');

const is = new InformationSharing();
const contextPackage = await is.buildContextPackage(goalDoc);

// 分发给Agent
const distributed = is.distributeToAgents(agents);
```

### 3. RoleAssignment（角色分工）

```javascript
const { RoleAssignment } = require('./scripts/democratic-collaboration');

const ra = new RoleAssignment();
ra.registerAgents(agentConfigs);
const matrix = ra.assignRoles(goalDoc, contextPackage);
```

### 4. CoordinationMechanism（协调机制）

```javascript
const { CoordinationMechanism } = require('./scripts/democratic-collaboration');

const cm = new CoordinationMechanism();
cm.establishProtocol();

// 投票决策
const votingResult = await cm.executeVoting(proposals, voters);
```

### 5. FeedbackLoop（反馈闭环）

```javascript
const { FeedbackLoop } = require('./scripts/democratic-collaboration');

const fl = new FeedbackLoop();
fl.recordFeedback({
  agentId: 'executor',
  stage: 'execution',
  status: 'success',
  output: result
});

const summary = fl.generateSummary();
```

### 6. SupervisionBalance（监督制衡）

```javascript
const { SupervisionBalance } = require('./scripts/democratic-collaboration');

const sb = new SupervisionBalance();

// 设置检查点
sb.addCheckpoint('execution', {
  completeness: 0.8,
  correctness: 0.8
});

// 执行检查
const inspection = await sb.inspect('execution', data);

// 否决
sb.veto('安全风险', 'reviewer');
```

### 7. ErrorCorrection（纠错机制）

```javascript
const { ErrorCorrection } = require('./scripts/democratic-collaboration');

const ec = new ErrorCorrection();

// 检测错误
const error = ec.detect(result);

// 处理错误
if (error) {
  await ec.handle(error);
}
```

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
      "qualityScore": 0.8,
      "goalAchievement": 0.9
    },
    "roles": {
      "coordinator": ["planner"],
      "executor": ["executor", "live-ops", "browser", "search"],
      "reviewer": ["reviewer"],
      "supervisor": ["reviewer"],
      "supporter": ["cs-agent"]
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
| goalAchievement | 0.9 | 目标达成率阈值 |

## 角色权限

| 角色 | 权限 |
|------|------|
| coordinator | decide, dispatch, monitor, report |
| executor | execute, report, request_help |
| reviewer | review, veto, approve, report |
| supervisor | monitor, alert, report, intervene |
| supporter | provide, assist, report |

## 决策模式

| 模式 | 触发条件 | 说明 |
|------|---------|------|
| user | importance = high | 用户决策 |
| voting | importance = medium && conflict = high | 投票决策 |
| single | importance = low | 单点决策 |
| consensus | 默认 | 共识决策 |

## 一票否决

以下情况触发一票否决：
- 安全风险（security_risk）
- 合规违规（compliance_violation）
- 权限越界（permission_overflow）
- 资源超限（resource_overlimit）

## 与现有系统集成

### 与反馈系统集成

```javascript
// 自动记录到 subagent-feedback 系统
await integration.integrateWithFeedback(result);
```

### 与记忆系统集成

```javascript
// 协作记录自动保存到 memory/collaboration-records/
await integration.recordCollaboration(result);
```

## 文件结构

```
scripts/
├── democratic-collaboration.js           # 核心模块（七步闭环）
├── openclaw-democratic-integration.js    # OpenClaw 集成器
└── subagent-feedback.js                  # 反馈系统（已有）

memory/
├── democratic-agent-collaboration-checklist.md  # Checklist
├── whole-process-democracy-agent-collaboration.md # 理论分析
└── collaboration-records/               # 协作记录
    └── {timestamp}.json
```

## 示例输出

```json
{
  "success": true,
  "steps": [
    {
      "step": "goalAlignment",
      "result": {
        "goal": { "description": "开发用户登录功能" },
        "confidence": 0.85,
        "status": "aligned"
      }
    },
    {
      "step": "feedback",
      "result": {
        "total": 5,
        "successes": 4,
        "failures": 1,
        "successRate": 0.8
      }
    }
  ],
  "errors": []
}
```

---

_创建时间: 2026-03-24_
_版本: 1.0_