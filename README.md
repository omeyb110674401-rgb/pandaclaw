# PandaClaw 🐼

> 民主协商决策系统 - 多智能体协作决策框架

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 简介

PandaClaw 是一个基于民主协商制度的多智能体决策框架，模拟中国政治协商会议（政协）和人民代表大会（人大）的协作模式，实现：

- 🏛️ **民主集中制** - 政协协商建议，人大审议表决
- 🎭 **专业身份系统** - 185+ 可插拔专业身份
- 🔄 **七步闭环** - 完整的决策流程保障
- 🤝 **独立思考** - 信息隔离，确保真实独立判断

## 核心概念

### 双层决策架构

```
┌─────────────────────────────────────────────────────────────┐
│                    民主协商决策系统                           │
├─────────────────────────────────────────────────────────────┤
│  政协委员会（CPPCC）— 协商议政，建言献策                      │
│      ├─ 提案权：可提出方案建议                               │
│      ├─ 建议权：参与协商讨论                                 │
│      └─ 无决策权：最终决策在人大                             │
├─────────────────────────────────────────────────────────────┤
│  人民代表大会（NPC）— 审议表决，集体决策                      │
│      ├─ 审议权：审核政协提案                                 │
│      ├─ 质询权：提出质疑问题                                 │
│      └─ 决策权：投票表决，少数服从多数                        │
└─────────────────────────────────────────────────────────────┘
```

### 七步闭环流程

```
步骤1-4：准备阶段（用户验收）
    │
    ├── 1. 目标对齐 → 确认目标理解一致
    ├── 2. 信息共享 → 确认背景信息充足
    ├── 3. 角色分工 → 确认身份权限明确
    └── 4. 协调机制 → 确认规则时间确定
    │
    ▼
步骤5：政协协商（两轮）
    │
    ├── 5-1. 独立输出 → 不看他人，独立分析
    └── 5-2. 意见共享 → 附议/补充/反对/独立
    │
    ▼
步骤6：人大表决（三轮）
    │
    ├── 6-1. 质询 → 必须提出至少1个质疑问题
    ├── 6-2. 政协回应 → 回应质询
    └── 6-3. 投票 → 赞成/反对/弃权 + 理由
    │
    ▼
步骤7：决策输出
    │
    └── 写入文件 → meetings/meeting-{id}.json
```

## 快速开始

### 安装

```bash
git clone https://github.com/yourusername/pandaclaw.git
cd pandaclaw
npm install
```

### 基础用法

```javascript
const { MeetingManager } = require('./src/democratic-meeting-system');

// 创建会议管理器
const manager = new MeetingManager();

// 创建会议
const meeting = manager.createMeeting({
  type: 'project-planning',
  topic: '开发AI智能客服系统',
  description: '构建一个支持多轮对话的智能客服...',
  complexity: 'complex'  // simple | medium | complex | enterprise
});

// 执行七步闭环
meeting.alignGoal();        // 步骤1：目标对齐
meeting.shareInformation(); // 步骤2：信息共享
meeting.assignRoles();      // 步骤3：角色分工（自动身份匹配）
meeting.establishCoordination(); // 步骤4：协调机制
meeting.deliberate(opinions); // 步骤5：政协协商讨论
meeting.vote(votes);         // 步骤6：人大审议表决
meeting.makeDecision();      // 步骤7：输出决策
```

### 快速会议

```javascript
const result = manager.runQuickMeeting(
  '搭建DevOps流水线',
  '搭建CI/CD自动化部署系统，支持多环境部署',
  'medium'
);

console.log(result.decision);
// 输出：完整决策记录
```

## 专业身份系统

### 身份分类

**人大（全局观身份，25个）**
| 类别 | 身份 |
|------|------|
| 架构评判 | 系统架构师、解决方案架构师 |
| 可行性评估 | 可行性分析师、投资分析师 |
| 风险评估 | 风险评估师、合规专家 |
| 质量监督 | 质量监督员、代码审查员 |
| 安全审计 | 安全审计员、渗透测试专家 |

**政协（特定领域专家，160个）**
| 领域 | 身份示例 |
|------|----------|
| 前端 | 前端专家、移动端专家、UX专家 |
| 后端 | 后端专家、数据库专家、API设计师 |
| AI | AI工程师、NLP专家、CV专家、ML工程师 |
| 产品 | 产品专家、用户研究员、增长黑客 |
| 运维 | DevOps专家、SRE工程师、云架构师 |

### 身份绑定

```javascript
const expertise = require('./src/expertise-binding-system');

// 绑定身份
expertise.bindExpertise('npc-1', 'system-architect');
expertise.bindExpertise('cppcc-1', 'ai-engineer');

// 生成系统提示词
const prompt = expertise.generateSystemPrompt('npc-1');
```

### 项目自动匹配

```javascript
const matcher = require('./src/project-expertise-matcher');

const result = matcher.generateBindingRecommendation(
  '开发一个AI Agent系统，支持多智能体协作',
  'complex'
);

// 输出
// {
//   projectType: 'AI Agent项目',
//   complexity: '复杂项目',
//   bindings: {
//     'npc-1': { expertiseId: 'agents-orchestrator', expertiseName: '智能体编排者' },
//     'cppcc-1': { expertiseId: 'ai-engineer', expertiseName: 'AI工程师' },
//     ...
//   }
// }
```

## 会议产物

| 产物 | 说明 |
|------|------|
| 目标文档 | 目标定义 + 成功标准 + 约束条件 |
| 上下文包 | 背景 + 历史 + 偏好 + 知识库 |
| 角色矩阵 | 人大/政协分工 + 权限定义 |
| 协商结果 | 政协委员专业意见汇总 |
| 表决结果 | 人大投票 + 理由记录 |
| 最终决策 | 完整决策 + 后续步骤 |
| **分层文档** | **L1 摘要/L2 过程/L3 决议/L4 档案** |

## 核心原则

| 原则 | 说明 |
|------|------|
| 民主集中制 | 政协协商，人大决策 |
| 专业视角 | 每位成员从专业视角分析 |
| 独立思考 | 步骤5-1不看他人意见 |
| 强制质询 | 每位人大至少提出1个问题 |
| 投票带理由 | 每票必须附带理由 |
| 少数服从多数 | 赞成 > 反对 → 通过 |

## 目录结构

```
pandaclaw/
├── src/                          # 核心代码
│   ├── democratic-meeting-system.js   # 会议系统核心
│   ├── expertise-binding-system.js    # 身份绑定系统
│   ├── expertise-categories.js        # 185个专业身份
│   ├── project-expertise-matcher.js   # 项目身份匹配
│   ├── meeting-state-store.js         # 状态持久化
│   ├── meeting-message-template.js    # 消息模板（信息隔离）
│   ├── layered-document-generator.js  # 分层文档生成器
│   ├── document-index.js              # 文档索引与检索
│   ├── cppcc-interaction.js           # 政协交互环
│   ├── npc-inquiry.js                 # 人大质询通道
│   └── improved-meeting-flow.js       # 改进后的会议流程
│
├── docs/                         # 文档
│   ├── seven-steps-guide.md           # 七步闭环详细指南
│   ├── meeting-system-flow.md         # 完整运行链路
│   ├── agent-meeting-guide.md         # Agent参与指南
│   └── democracy-system-design.md     # 系统设计文档
│
├── examples/                     # 示例
│   ├── basic-meeting.js               # 基础会议示例
│   └── quick-meeting.js               # 快速会议示例
│
├── tests/                        # 测试
│   ├── test-meeting-system.js         # 会议系统测试
│   ├── test-expertise-system.js       # 身份系统测试
│   └── test-project-matcher.js        # 匹配系统测试
│
├── README.md                     # 项目说明
├── LICENSE                       # MIT 许可证
└── package.json                  # 依赖配置
```

## 复杂度映射

| 复杂度 | 政协 | 人大 | 周期 | 团队 |
|--------|------|------|------|------|
| simple | 2 | 1 | <1周 | 1-2人 |
| medium | 3 | 2 | 1-4周 | 2-5人 |
| complex | 4 | 3 | 1-3月 | 5-10人 |
| enterprise | 5 | 5 | >3月 | >10人 |

## 开发

```bash
# 运行测试
npm test

# 运行示例
node examples/basic-meeting.js
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 致谢

本系统设计灵感来源于中国政治协商制度和人民代表大会制度，旨在通过模拟民主协商机制，实现多智能体的集体智慧决策。

---

🐼 PandaClaw - 民主协商，科学决策