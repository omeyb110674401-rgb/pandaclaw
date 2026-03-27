# PandaClaw 🐼

> 民主协商决策系统 - 双维度效率控制的多智能体协作框架

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 核心设计

### 两个层次

| 层次 | 说明 |
|------|------|
| **大流程** | 文书产生流程（国家文件产生流程） |
| **小流程** | 七步闭环（民主协商决策机制） |

**关系：** 大流程每个步骤 = 一次七步闭环会议

### 双维度效率控制

| 维度 | 控制内容 | 作用 |
|------|----------|------|
| **人数** | 政协/人大各几人 | 讨论深度 |
| **验收** | 步骤1-4是否用户验收 | 流程严谨度 |

---

## 六种会议类型

| 类型 | 图标 | 大流程参照 | 典型验收 |
|------|------|------------|----------|
| 协商型 | 📘 | 白皮书 | 关键验收 |
| 战略型 | 📜 | 一号文件 | 完整验收 |
| 决议型 | 📕 | 红头文件 | 跳过验收 |
| 规划型 | 📊 | 规划纲要 | 关键验收 |
| 立法型 | ⚖️ | 行政法规 | 完整验收 |
| 纪要型 | 📝 | 会议纪要 | 跳过验收 |

---

## 大流程定义

### 协商型
```
立项 → 成立起草组 → 调查研究 → 起草初稿 → 征求意见 → 审议表决 → 审定发布
```

### 战略型
```
中期评估 → 前期研究 → 建议起草 → 征求意见 → 人大审议 → 规划编制 → 最终批准
```

### 决议型
```
立项 → 起草 → 审议 → 签署公布
```

### 规划型
```
中期评估 → 趋势研究 → 建议起草 → 征求意见 → 规划编制 → 审议批准
```

### 立法型
```
立项 → 起草 → 公开征求意见 → 专家论证 → 合规审查 → 审议 → 签署公布 → 施行
```

### 纪要型
```
记录 → 整理 → 确认 → 存档
```

---

## 七步闭环

> 详见 AGENTS.md

```
步骤1-4：准备阶段（用户验收可选）
步骤5：政协协商（两轮）
步骤6：人大表决（三轮）
步骤7：决策输出
```

---

## 人数配置

| 复杂度 | 政协 | 人大 | 说明 |
|--------|------|------|------|
| simple | 2 | 1 | 快速决策 |
| medium | 3 | 2 | 平衡效率 |
| complex | 4 | 3 | 深度审议 |
| enterprise | 5 | 5 | 全会协商 |

---

## 快速开始

```javascript
const { createMeeting } = require('./src/meeting-flow-executor');

// 创建会议
const { meetingId, executor } = await createMeeting({
  meetingType: 'CONSULTATION',
  topic: '技术架构选型',
  complexity: 'medium',
  requireUserValidation: 'key',  // 完整/关键/跳过
  participants: {
    cppcc: ['cppcc-1', 'cppcc-2', 'cppcc-3'],
    npc: ['npc-1', 'npc-2']
  }
});

// 执行流程
while (executor.currentStageIndex < executor.flow.stages.length) {
  const stage = await executor.startNextStage();
  await executor.completeCurrentStage({ data: {} });
}
```

---

## 核心原则

1. **分形结构** - 大流程每步可召开七步闭环会议
2. **双维度控制** - 人数 + 验收共同决定效率
3. **关键节点** - 高风险步骤需要完整验收
4. **灵活配置** - 根据需求组合复杂度和验收模式

---

## 文件结构

```
pandaclaw/
├── src/
│   ├── meeting-flow-independent.js   # 大流程定义
│   ├── meeting-flow-executor.js      # 流程执行器
│   ├── stage-executors.js            # 阶段执行器
│   └── meeting-document-templates.js # 文档模板
├── docs/
│   ├── meeting-flow-system.md        # 流程系统文档
│   └── seven-steps-guide.md          # 七步闭环详解
└── README.md
```

---

## 许可证

MIT License

---

🐼 PandaClaw - 民主协商，科学决策