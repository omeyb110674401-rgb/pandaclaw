# PandaClaw 会议流程系统

> 基于国家官方文件产生流程设计的独立会议类型系统

---

## 设计理念

### ❌ 之前的错误

```
以七步闭环为"预设答案"
↓
其他类型是"跳过步骤"、"增强步骤"的变体
↓
"减法"思维
```

### ✅ 正确的设计

```
每种会议类型独立设计
↓
参照国家对应文件的产生流程
↓
完全独立的流程定义
```

---

## 会议类型体系

| 类型 | 图标 | 参照 | 阶段数 | 时长 |
|------|------|------|--------|------|
| **协商型** | 📘 | 白皮书 | 7 | 3-7 天 |
| **战略型** | 📜 | 一号文件 | 7 | 30-60 天 |
| **决议型** | 📕 | 红头文件 | 4 | 1 小时 |
| **规划型** | 📊 | 规划纲要 | 6 | 21-42 天 |
| **立法型** | ⚖️ | 行政法规 | 8 | 30-60 天 |
| **纪要型** | 📝 | 会议纪要 | 4 | 30 分钟 |

---

## 独立流程定义

### 协商型会议（白皮书风格）

**国家白皮书产生流程：**
1. 立项 → 2. 成立起草组 → 3. 调查研究 → 4. 起草初稿 → 5. 征求意见 → 6. 审议表决 → 7. 审定发布

**PandaClaw 实现：**
```javascript
立项 → 成立起草组 → 调查研究 → 起草初稿 → 征求意见 → 审议表决 → 审定发布
```

---

### 战略型会议（一号文件风格）

**国家一号文件产生流程：**
1. 中期评估 → 2. 前期研究 → 3. 建议起草 → 4. 征求意见 → 5. 审议通过 → 6. 纲要编制 → 7. 人大批准

**PandaClaw 实现：**
```javascript
中期评估 → 前期研究 → 建议起草 → 征求意见 → 人大审议 → 规划编制 → 最终批准
```

---

### 决议型会议（红头文件风格）

**国家红头文件产生流程：**
1. 立项 → 2. 起草 → 3. 征求意见 → 4. 审议 → 5. 签署公布

**PandaClaw 实现：**
```javascript
立项 → 起草 → 审议 → 签署公布
```

---

### 规划型会议（规划纲要风格）

**国家规划纲要产生流程：**
1. 中期评估 → 2. 前期研究 → 3. 建议起草 → 4. 征求意见 → 5. 编制 → 6. 批准

**PandaClaw 实现：**
```javascript
中期评估 → 趋势研究 → 建议起草 → 征求意见 → 规划编制 → 审议批准
```

---

### 立法型会议（行政法规风格）

**国家行政法规产生流程：**
1. 立项 → 2. 起草 → 3. 公开征求意见 → 4. 专家论证 → 5. 审查 → 6. 审议 → 7. 签署公布 → 8. 施行

**PandaClaw 实现：**
```javascript
立项 → 起草 → 公开征求意见 → 专家论证 → 合规审查 → 审议 → 签署公布 → 施行
```

---

### 纪要型会议（会议纪要风格）

**会议纪要产生流程：**
1. 记录 → 2. 整理 → 3. 确认 → 4. 存档

**PandaClaw 实现：**
```javascript
记录 → 整理 → 确认 → 存档
```

---

## 核心文件

| 文件 | 说明 |
|------|------|
| `src/meeting-flow-independent.js` | 6 种独立流程定义 |
| `src/meeting-flow-executor.js` | 流程执行器 |
| `src/stage-executors.js` | 各阶段具体执行逻辑 |
| `src/meeting-document-templates-v2.js` | 文档模板生成器 |

---

## 使用方法

### 创建会议

```javascript
const { createMeeting } = require('./src/meeting-flow-executor');

// 创建协商型会议
const { meetingId, executor, flow } = await createMeeting({
  meetingType: 'CONSULTATION',
  topic: '技术架构选型',
  description: '为新项目选择技术架构',
  participants: {
    cppcc: ['cppcc-1', 'cppcc-2', 'cppcc-3'],
    npc: ['npc-1', 'npc-2']
  }
});

console.log('会议 ID:', meetingId);
console.log('流程:', flow.name);
console.log('阶段数:', flow.stages.length);
```

### 执行流程

```javascript
// 开始下一阶段
const stageInfo = await executor.startNextStage();

console.log('当前阶段:', stageInfo.stageName);
console.log('参与者:', stageInfo.participants);
console.log('活动:', stageInfo.activities);
console.log('产出:', stageInfo.outputs);

// 完成阶段
await executor.completeCurrentStage({
  summary: '阶段完成',
  data: { /* 阶段数据 */ }
});

// 获取进度
const progress = executor.getProgress();
console.log('进度:', progress.percentage + '%');
```

### 生成文档

```javascript
const { generateDocument } = require('./src/meeting-document-templates-v2');

// 获取会议状态
const state = executor.state;

// 生成文档
const doc = generateDocument(state);

console.log(doc);
```

---

## 流程对比

```
协商型：立项 → 成立起草组 → 调查研究 → 起草初稿 → 征求意见 → 审议表决 → 审定发布
战略型：中期评估 → 前期研究 → 建议起草 → 征求意见 → 人大审议 → 规划编制 → 最终批准
决议型：立项 → 起草 → 审议 → 签署公布
规划型：中期评估 → 趋势研究 → 建议起草 → 征求意见 → 规划编制 → 审议批准
立法型：立项 → 起草 → 公开征求意见 → 专家论证 → 合规审查 → 审议 → 签署公布 → 施行
纪要型：记录 → 整理 → 确认 → 存档
```

---

## 文档输出

| 类型 | 文档风格 |
|------|----------|
| 协商型 | 白皮书格式 |
| 战略型 | 一号文件格式 |
| 决议型 | 红头文件格式 |
| 规划型 | 规划纲要格式 |
| 立法型 | 行政法规格式 |
| 纪要型 | 会议纪要格式 |

---

## 核心原则

1. **独立设计** - 每种类型有独立流程，不是七步闭环的变体
2. **参照国家** - 参照国家对应文件的产生流程
3. **功能导向** - 根据实际需求设计阶段
4. **清晰产出** - 每个阶段有明确的产出物

---

_ PandaClaw - 民主协商，科学决策 _