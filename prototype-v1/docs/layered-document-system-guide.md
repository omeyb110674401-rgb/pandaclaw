# 分层文档系统使用指南

> 按用途分层，便于检索和归档

---

## 🎯 设计理念

**之前的问题：**
- ❌ 按格式分类（白皮书/红头/纪要），形式大于内容
- ❌ 一份会议生成 4 份相似文档，冗余
- ❌ 难以检索，关键词散落在各处
- ❌ 归档混乱，找不到历史文档

**现在的方案：**
- ✅ 按用途分层（摘要/过程/决议/档案），功能导向
- ✅ 一份会议生成 1 套分层文档，各有侧重
- ✅ 统一索引，全文检索，标签筛选
- ✅ 分类归档，快速定位

---

## 📊 分层结构

### L1 - 决策摘要（1 页）

**用途：** 快速浏览、新人上手、周报汇总

**包含内容：**
- 议题、决策结果、表决票数
- 核心分歧点
- 关键决策依据
- 执行负责人、完成时限
- 关键词标签

**示例：**
```json
{
  "level": "L1",
  "type": "决策摘要",
  "content": {
    "decision": "通过",
    "voteResult": { "赞成": 3, "反对": 0, "弃权": 0 },
    "coreDisagreements": [
      { "area": "技术选型", "opinions": ["...", "..."] }
    ],
    "keyDecisionBasis": ["安全考虑：...", "成本控制：..."],
    "executionOwner": "npc-1",
    "deadline": "2026-04-30"
  },
  "keywords": ["AI", "RAG", "向量数据库", "Milvus"]
}
```

---

### L2 - 协商过程（3-5 页）

**用途：** 理解决策形成过程、复盘改进

**包含内容：**
- 独立意见（每位委员的专业分析）
- 立场收敛（附议/补充/反对/独立）
- 质询记录（人大提问 + 政协回应）
- 过程统计（意见数、立场分布等）

**示例：**
```json
{
  "level": "L2",
  "type": "协商过程",
  "content": {
    "独立意见": [
      { "agent": "cppcc-1", "expertise": "AI 工程师", "opinion": "...", "risks": [...] }
    ],
    "立场收敛": [
      { "agent": "cppcc-2", "stance": "补充", "reason": "..." }
    ],
    "质询记录": [
      { "agent": "npc-1", "questions": ["..."], "response": ["..."] }
    ],
    "stats": {
      "totalOpinions": 4,
      "totalStances": 4,
      "stanceDistribution": { "附议": 1, "补充": 2, "独立": 1 }
    }
  }
}
```

---

### L3 - 执行决议（1 页）

**用途：** 下发执行、责任落实、验收依据

**包含内容：**
- 正式决策（批准执行/不予批准）
- 任务分解（任务名、负责人、时限、验收标准）
- 验收条件
- 变更机制

**示例：**
```json
{
  "level": "L3",
  "type": "执行决议",
  "content": {
    "decision": "批准执行",
    "tasks": [
      { "name": "知识库搭建", "owner": "cppcc-1", "deadline": "04-15", "acceptance": "..." }
    ],
    "acceptanceCriteria": ["功能测试通过率 100%", "性能指标达标"],
    "changeMechanism": "重大变更需重新协商（赞成票>反对票）"
  },
  "actionableTasks": [
    { "task": "知识库搭建", "owner": "cppcc-1", "status": "pending" }
  ]
}
```

---

### L4 - 完整档案（N 页）

**用途：** 审计、合规、长期存档

**包含内容：**
- 完整原始数据
- 操作日志
- 版本历史

**示例：**
```json
{
  "level": "L4",
  "type": "完整档案",
  "content": {
    "rawState": { /* 完整会议状态 */ },
    "auditLog": [
      { "time": "2026-03-27T10:00:00Z", "action": "会议创建", "details": "..." }
    ],
    "versionHistory": [
      { "version": "1.0", "date": "...", "changes": "初始归档" }
    ]
  }
}
```

---

## 🚀 使用方法

### 方式 1：代码调用

```javascript
const { saveLayeredDocuments, generateLayeredDocument } = require('./scripts/meeting-state-store');
const { searchDocuments, searchByTags } = require('./scripts/document-index');

// ========== 生成文档 ==========

// 生成全套分层文档（推荐）
const paths = saveLayeredDocuments('meeting-20260327-123456');
// 返回：{ L1: '...', L2: '...', L3: '...', L4: '...' }

// 或单独生成某一层
const summary = generateLayeredDocument('meeting-20260327-123456', 'L1');

// ========== 检索文档 ==========

// 全文检索
const results = searchDocuments('AI 架构');
// 返回：[{ meetingId, topic, keywords, level, ... }]

// 按标签筛选
const tagged = searchByTags(['AI 工程师', '后端专家']);

// 获取某会议的所有文档
const { index, documents } = getMeetingDocuments('meeting-20260327-123456');

// ========== 归档管理 ==========

// 归档会议
archiveMeeting('meeting-20260327-123456', './archive/2026');

// 生成标签云
const tagCloud = generateTagCloud();
// 返回：{ "AI 工程师": 5, "后端专家": 3, ... }
```

---

### 方式 2：命令行工具

```bash
# 生成全套分层文档
node scripts/demo-layered-docs.js

# 检索文档
node scripts/search-documents.js "AI 架构"

# 按标签筛选
node scripts/search-documents.js --tags "AI 工程师" "后端专家"

# 列出所有会议
node scripts/search-documents.js --list

# 生成标签云
node scripts/search-documents.js --tags-cloud
```

---

## 📁 文件结构

```
workspace/
├── meetings/
│   ├── meeting-xxx.json           # 原始会议数据
│   ├── documents/                 # 分层文档
│   │   ├── meeting-xxx-l1.json    # L1 - 决策摘要
│   │   ├── meeting-xxx-l2.json    # L2 - 协商过程
│   │   ├── meeting-xxx-l3.json    # L3 - 执行决议
│   │   └── meeting-xxx-l4.json    # L4 - 完整档案
│   └── index/                     # 索引
│       ├── master-index.json      # 总索引（所有会议）
│       ├── meeting-xxx-index.json # 单会议索引
│       └── archived/              # 归档目录
│           └── 2026/
│               └── meeting-xxx-*.json
```

---

## 🔍 检索功能

### 全文检索

```javascript
// 检索"AI"相关文档
const results = searchDocuments('AI');

// 带过滤的检索
const results = searchDocuments('架构', {
  status: 'completed',  // 只看已完成的会议
  level: 'L1'           // 只看决策摘要
});
```

### 标签检索

```javascript
// 单个标签
const results = searchByTags(['AI 工程师']);

// 多个标签（与关系）
const results = searchByTags(['AI 工程师', '后端专家']);
```

### 高级检索

```javascript
// 按时间范围
const results = listMeetings({
  fromDate: '2026-01-01',
  toDate: '2026-03-31',
  sortBy: 'createdAt'
});

// 按状态
const completed = listMeetings({ status: 'completed' });
const pending = listMeetings({ status: 'pending' });
```

---

## 🏷️ 标签系统

### 自动提取的标签

- 议题关键词
- 专业身份（AI 工程师、后端专家等）
- 技术名词（RAG、向量数据库、微服务等）

### 手动添加标签（后续功能）

```javascript
// 为会议添加自定义标签
addTags('meeting-xxx', ['P0 优先级', '核心项目']);

// 移除标签
removeTags('meeting-xxx', ['P0 优先级']);
```

---

## 📦 归档策略

### 自动归档

```javascript
// 会议完成后自动归档 L4 文档
if (state.status === 'completed') {
  archiveMeeting(meetingId, `./archive/${year}`);
}
```

### 手动归档

```bash
# 归档指定年份的会议
node scripts/archive-meetings.js --year 2026

# 归档指定状态的会议
node scripts/archive-meetings.js --status completed
```

---

## 📊 统计功能

### 标签云

```javascript
const tagCloud = generateTagCloud();
// { "AI 工程师": 10, "后端专家": 8, "RAG": 5, ... }
```

### 会议统计

```javascript
// 按状态统计
const stats = {
  completed: listMeetings({ status: 'completed' }).length,
  pending: listMeetings({ status: 'pending' }).length,
  paused: listMeetings({ status: 'paused' }).length
};

// 按时间统计（月度）
const monthlyStats = getMonthlyStats(2026);
// { "01": 5, "02": 8, "03": 12, ... }
```

---

## 🎯 最佳实践

### 1. 会议结束后立即生成

```javascript
// 会议完成时
meeting.completeMeeting(decision);
saveLayeredDocuments(meeting.id);  // 生成全套文档
```

### 2. 定期归档

```bash
# 每月归档一次
0 0 1 * * node scripts/archive-meetings.js --last-month
```

### 3. 周报自动生成

```javascript
// 从 L1 摘要生成周报
const thisWeekMeetings = listMeetings({
  fromDate: getMonday(),
  toDate: getSunday()
});

const weeklyReport = thisWeekMeetings.map(m => {
  const summary = generateLayeredDocument(m.meetingId, 'L1');
  return `${m.topic} - ${summary.content.decision}`;
});
```

### 4. 新人培训材料

```javascript
// 收集典型会议案例
const examples = searchByTags(['典型案例', '教学']);
examples.forEach(ex => {
  const L2 = generateLayeredDocument(ex.meetingId, 'L2');
  // 用于新人学习协商过程
});
```

---

## 🔧 扩展开发

### 添加自定义层级

```javascript
// scripts/layered-document-generator.js

function generateCustomReport(state) {
  return {
    level: 'L5',
    type: '自定义报告',
    content: {
      // 自定义内容
    }
  };
}
```

### 添加自定义检索字段

```javascript
// scripts/document-index.js

function searchByCustomField(field, value) {
  // 自定义检索逻辑
}
```

---

_ PandaClaw 民主协商会议系统 - 实用、可检索、易归档 _