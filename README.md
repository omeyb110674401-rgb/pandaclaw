# PandaClaw 🐼

> 民主协商决策系统 - 多智能体协作决策框架

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 简介

PandaClaw 是一个基于民主协商制度的多智能体决策框架，参照国家官方文件产生流程设计独立会议类型系统。

## 核心特性

- 🏛️ **独立流程设计** - 6 种会议类型，各有独立流程
- 🎭 **专业身份系统** - 185+ 可插拔专业身份
- 📊 **参照国家流程** - 白皮书/一号文件/红头文件等
- 📝 **自动文档生成** - 各类型对应风格文档

## 会议类型

| 类型 | 图标 | 参照 | 阶段 | 时长 |
|------|------|------|------|------|
| 协商型 | 📘 | 白皮书 | 7 | 3-7 天 |
| 战略型 | 📜 | 一号文件 | 7 | 30-60 天 |
| 决议型 | 📕 | 红头文件 | 4 | 1 小时 |
| 规划型 | 📊 | 规划纲要 | 6 | 21-42 天 |
| 立法型 | ⚖️ | 行政法规 | 8 | 30-60 天 |
| 纪要型 | 📝 | 会议纪要 | 4 | 30 分钟 |

## 独立流程

### 协商型（白皮书风格）
```
立项 → 成立起草组 → 调查研究 → 起草初稿 → 征求意见 → 审议表决 → 审定发布
```

### 战略型（一号文件风格）
```
中期评估 → 前期研究 → 建议起草 → 征求意见 → 人大审议 → 规划编制 → 最终批准
```

### 决议型（红头文件风格）
```
立项 → 起草 → 审议 → 签署公布
```

### 规划型（规划纲要风格）
```
中期评估 → 趋势研究 → 建议起草 → 征求意见 → 规划编制 → 审议批准
```

### 立法型（行政法规风格）
```
立项 → 起草 → 公开征求意见 → 专家论证 → 合规审查 → 审议 → 签署公布 → 施行
```

### 纪要型（会议纪要风格）
```
记录 → 整理 → 确认 → 存档
```

## 快速开始

```javascript
const { createMeeting } = require('./src/meeting-flow-executor');

// 创建会议
const { meetingId, executor } = await createMeeting({
  meetingType: 'CONSULTATION',
  topic: '技术架构选型',
  participants: {
    cppcc: ['cppcc-1', 'cppcc-2'],
    npc: ['npc-1']
  }
});

// 执行流程
while (executor.currentStageIndex < executor.flow.stages.length) {
  const stage = await executor.startNextStage();
  await executor.completeCurrentStage({ data: {} });
}

// 生成文档
const { generateDocument } = require('./src/meeting-document-templates-v2');
const doc = generateDocument(executor.state);
```

## 目录结构

```
pandaclaw/
├── src/
│   ├── meeting-flow-independent.js   # 独立流程定义
│   ├── meeting-flow-executor.js      # 流程执行器
│   ├── stage-executors.js            # 阶段执行器
│   ├── meeting-document-templates-v2.js  # 文档模板
│   ├── expertise-binding-system.js   # 身份绑定
│   └── expertise-categories.js       # 185 个身份
├── docs/
│   ├── meeting-flow-system.md        # 流程系统说明
│   ├── seven-steps-guide.md          # 七步闭环指南
│   └── ...
├── examples/
│   └── ...
└── README.md
```

## 文档输出

| 类型 | 文档风格 |
|------|----------|
| 协商型 | 白皮书格式 |
| 战略型 | 一号文件格式 |
| 决议型 | 红头文件格式 |
| 规划型 | 规划纲要格式 |
| 立法型 | 行政法规格式 |
| 纪要型 | 会议纪要格式 |

## 设计原则

1. **独立设计** - 每种类型有独立流程，不是变体
2. **参照国家** - 参照国家文件产生流程
3. **功能导向** - 根据实际需求设计阶段
4. **清晰产出** - 每个阶段有明确产出物

## 许可证

MIT License

---

🐼 PandaClaw - 民主协商，科学决策