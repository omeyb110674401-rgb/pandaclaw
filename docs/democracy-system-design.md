# 民主协商决策系统设计

## 一、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     民主协商决策系统                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   小窝 (main) - 主控Agent，协调调度                              │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  政协委员会（5人）— 协商议政                              │  │
│   │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐               │  │
│   │  │cppcc│ │cppcc│ │cppcc│ │cppcc│ │cppcc│               │  │
│   │  │ -1  │ │ -2  │ │ -3  │ │ -4  │ │ -5  │               │  │
│   │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘               │  │
│   │     │       │       │       │       │                    │  │
│   │     └───────┴───────┴───────┴───────┘                    │  │
│   │                     │                                     │  │
│   │                     ▼                                     │  │
│   │     ┌─────────────────────────────────────┐             │  │
│   │     │     专业身份插拔系统                  │             │  │
│   │     │  ┌─────┐ ┌─────┐ ┌─────┐           │             │  │
│   │     │  │前端 │ │后端 │ │产品 │ ...       │             │  │
│   │     │  │开发 │ │架构 │ │经理 │           │             │  │
│   │     │  └─────┘ └─────┘ └─────┘           │             │  │
│   │     └─────────────────────────────────────┘             │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  人民代表大会（5人）— 审议表决                            │  │
│   │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐               │  │
│   │  │ npc │ │ npc │ │ npc │ │ npc │ │ npc │               │  │
│   │  │ -1  │ │ -2  │ │ -3  │ │ -4  │ │ -5  │               │  │
│   │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘               │  │
│   │     │       │       │       │       │                    │  │
│   │     └───────┴───────┴───────┴───────┘                    │  │
│   │                     │                                     │  │
│   │                     ▼                                     │  │
│   │     ┌─────────────────────────────────────┐             │  │
│   │     │     专业身份插拔系统                  │             │  │
│   │     └─────────────────────────────────────┘             │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、角色定义

### 政协委员（cppcc-1 ~ cppcc-5）

**职责：**
- 从专业视角分析议题
- 提出建设性意见
- 参与提案讨论
- 寻求最大共识

**权利：**
- 提案权
- 建议权
- 协商权
- ❌ 无最终决策权

**特点：**
- 多元视角
- 建设性批评
- 兼顾各方利益
- 独立思考，不盲从

### 人大代表（npc-1 ~ npc-5）

**职责：**
- 审议提案
- 提出质询
- 投票表决
- 集体决策

**权利：**
- 审议权
- 质询权
- ✅ 最终决策权（投票）

**特点：**
- 少数服从多数
- 一人一票
- 决策具有约束力
- 独立判断，不受干预

---

## 三、专业身份插拔系统

### 核心概念

**"插拔"** = 将专业Agent的身份/视角动态赋予政协委员或人大代表

**示例：**
```
cppcc-1 + 前端开发者 = 技术视角的政协委员
cppcc-2 + 产品经理 = 产品视角的政协委员
npc-1 + 后端架构师 = 架构视角的人大代表
npc-2 + 安全工程师 = 安全视角的人大代表
```

### 支持的专业身份（15个）

| 专业Agent | 适用场景 |
|-----------|----------|
| xiaohongshu-operator | 小红书营销、种草 |
| douyin-strategist | 抖音短视频、直播 |
| wechat-operator | 微信生态、社群 |
| frontend-developer | 前端技术、UI实现 |
| backend-architect | 后端架构、API设计 |
| ai-engineer | AI模型、智能化 |
| product-manager | 产品设计、路线图 |
| code-reviewer | 代码质量、规范 |
| security-engineer | 安全合规、风险 |
| devops-automator | 运维自动化、CI/CD |
| ux-researcher | 用户体验、研究 |
| growth-hacker | 增长策略、获客 |
| seo-specialist | 搜索优化、流量 |
| content-creator | 内容策略、创作 |
| qa-tester | 质量保障、测试 |

### 插拔规则

**政协委员可绑定的专业身份：**
```javascript
const CPPCC_ALLOWED_EXPERTISE = [
  'product-manager',       // 产品视角
  'frontend-developer',    // 技术视角
  'ux-researcher',         // 用户视角
  'growth-hacker',         // 增长视角
  'content-creator',       // 内容视角
  'xiaohongshu-operator',  // 运营视角
  'douyin-strategist',     // 短视频视角
  'wechat-operator'        // 社群视角
];
```

**人大代表可绑定的专业身份：**
```javascript
const NPC_ALLOWED_EXPERTISE = [
  'backend-architect',     // 架构视角
  'ai-engineer',           // AI视角
  'security-engineer',     // 安全视角
  'devops-automator',      // 运维视角
  'code-reviewer',         // 质量视角
  'qa-tester'              // 测试视角
];
```

---

## 四、工作流程

### 流程1：政协协商会议

```
1. 小窝发起议题
   ↓
2. 为每位政协委员分配专业身份
   cppcc-1 → 前端开发者视角
   cppcc-2 → 产品经理视角
   cppcc-3 → UX研究员视角
   cppcc-4 → 增长黑客视角
   cppcc-5 → 内容创作者视角
   ↓
3. 各委员从各自专业视角分析议题
   ↓
4. 收集各方意见，汇总成提案
   ↓
5. 提交人大审议
```

### 流程2：人大审议表决

```
1. 收到政协提交的提案
   ↓
2. 为每位人大代表分配专业身份
   npc-1 → 后端架构师视角
   npc-2 → AI工程师视角
   npc-3 → 安全工程师视角
   npc-4 → DevOps自动化师视角
   npc-5 → 代码审查员视角
   ↓
3. 各代表从各自专业视角审议提案
   ↓
4. 投票表决（少数服从多数）
   ↓
5. 决策结果具有约束力
```

### 流程3：完整民主流程

```
用户需求
    │
    ▼
┌─────────────┐
│   小窝      │ ← 理解意图，发起议题
│  (main)     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 政协协商会议 │ ← 5位委员，各带专业视角
│  (cppcc)    │   提出建议，形成提案
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 人大审议表决 │ ← 5位代表，各带专业视角
│   (npc)     │   投票决策，少数服从多数
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   执行      │ ← 执行决策
│  (executor) │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   结果      │ ← 返回用户
└─────────────┘
```

---

## 五、API设计

### 绑定专业身份

```javascript
// 为政协委员绑定专业身份
bindExpertise('cppcc-1', 'frontend-developer');

// 为人大代表绑定专业身份
bindExpertise('npc-1', 'backend-architect');
```

### 发起协商

```javascript
// 发起政协协商会议
const result = await startConsultation({
  topic: '设计用户认证系统',
  bindings: {
    'cppcc-1': 'frontend-developer',
    'cppcc-2': 'product-manager',
    'cppcc-3': 'ux-researcher',
    'cppcc-4': 'security-engineer',
    'cppcc-5': 'growth-hacker'
  }
});
```

### 发起表决

```javascript
// 发起人大审议表决
const vote = await startVoting({
  proposal: result.proposal,
  bindings: {
    'npc-1': 'backend-architect',
    'npc-2': 'ai-engineer',
    'npc-3': 'security-engineer',
    'npc-4': 'devops-automator',
    'npc-5': 'code-reviewer'
  }
});
```

### 完整流程

```javascript
// 完整民主决策流程
const decision = await democraticDecision({
  topic: '用户认证系统设计',
  cppccBindings: { ... },
  npcBindings: { ... }
});
```

---

## 六、配置结构

### openclaw.json

```json
{
  "agents": {
    "list": [
      { "id": "main", "name": "小窝", "default": true },
      { "id": "cppcc-1", "name": "政协委员-1" },
      { "id": "cppcc-2", "name": "政协委员-2" },
      { "id": "cppcc-3", "name": "政协委员-3" },
      { "id": "cppcc-4", "name": "政协委员-4" },
      { "id": "cppcc-5", "name": "政协委员-5" },
      { "id": "npc-1", "name": "人大代表-1" },
      { "id": "npc-2", "name": "人大代表-2" },
      { "id": "npc-3", "name": "人大代表-3" },
      { "id": "npc-4", "name": "人大代表-4" },
      { "id": "npc-5", "name": "人大代表-5" },
      { "id": "xiaohongshu-operator", "name": "小红书运营专家" },
      { "id": "frontend-developer", "name": "前端开发者" },
      ...其他专业Agent
    ]
  },
  "democracy": {
    "cppcc": ["cppcc-1", "cppcc-2", "cppcc-3", "cppcc-4", "cppcc-5"],
    "npc": ["npc-1", "npc-2", "npc-3", "npc-4", "npc-5"],
    "expertise": {
      "cppcc": ["product-manager", "frontend-developer", "ux-researcher", ...],
      "npc": ["backend-architect", "ai-engineer", "security-engineer", ...]
    }
  }
}
```

---

_设计时间: 2026-03-25_