# 七步闭环详细操作指南

> 主控Agent (main) 执行会议的完整操作手册

---

## 概览

```
┌─────────────────────────────────────────────────────────────┐
│                    七步闭环完整流程                           │
├─────────────────────────────────────────────────────────────┤
│  步骤1-4：准备阶段（每步广播 → 用户验收）                      │
│  步骤5：政协协商（两轮）                                      │
│  步骤6：人大表决（三轮）                                      │
│  步骤7：决策输出                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 步骤1：目标对齐

### 目的
确保所有参与者对会议目标有清晰、一致的理解。

### 需要什么
- 明确的议题（topic）
- 项目描述（description）
- 成功标准
- 约束条件

### 怎么做

#### 1.1 收集信息
```
从用户输入中提取：
- 议题：一句话概括要讨论/决策的内容
- 描述：详细背景和期望结果
- 复杂度：simple / medium / complex / enterprise
```

#### 1.2 生成目标文档
```javascript
目标文档 = {
  topic: "议题标题",
  description: "详细描述",
  successCriteria: [
    "成功标准1",
    "成功标准2"
  ],
  constraints: {
    time: "时间约束",
    quality: "质量要求",
    resources: "资源限制"
  }
}
```

#### 1.3 广播给所有Agent
```javascript
// 广播消息模板
const message = `【步骤1：目标对齐】

议题：${topic}
描述：${description}

成功标准：
${successCriteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

约束条件：
- 时间：${constraints.time}
- 质量：${constraints.quality}
- 资源：${constraints.resources}

请确认你已理解目标，简短回复"确认"。`;

// 发送给所有Agent
sessions_send({ sessionKey: "agent:cppcc-1:main", message, timeoutSeconds: 0 });
sessions_send({ sessionKey: "agent:cppcc-2:main", message, timeoutSeconds: 0 });
// ... 发送给 cppcc-3,4,5 和 npc-1,2,3,4,5
```

#### 1.4 收集确认
```
等待所有Agent回复"确认"（通过 inter_session）
记录到会议状态：stepResults.goal_alignment
```

#### 1.5 用户验收
```
向用户展示目标文档
等待用户确认后进入步骤2
```

### 验收标准
- [ ] 目标清晰定义
- [ ] 所有Agent回复确认
- [ ] 用户验收通过

---

## 步骤2：信息共享

### 目的
确保所有参与者拥有足够的背景信息做出判断。

### 需要什么
- 背景信息
- 历史记录
- 用户偏好
- 相关文档

### 怎么做

#### 2.1 收集上下文
```javascript
上下文包 = {
  background: "项目背景",
  history: [
    "历史事件1",
    "历史事件2"
  ],
  preferences: {
    userPreference1: "偏好描述"
  },
  relatedDocs: [
    "文档路径1",
    "文档路径2"
  ]
}
```

#### 2.2 广播给所有Agent
```javascript
const message = `【步骤2：信息共享】

背景：
${background}

历史记录：
${history.map((h, i) => `${i+1}. ${h}`).join('\n')}

用户偏好：
${Object.entries(preferences).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

相关文档：
${relatedDocs.map((d, i) => `${i+1}. ${d}`).join('\n')}

请确认你已了解背景信息，简短回复"确认"。`;
```

#### 2.3 收集确认
#### 2.4 用户验收

### 验收标准
- [ ] 上下文完整
- [ ] 所有Agent回复确认
- [ ] 用户验收通过

---

## 步骤3：角色分工

### 目的
为每位参与者分配专业身份，明确权限边界。

### 需要什么
- 项目类型识别
- 复杂度评估
- 身份匹配规则

### 怎么做

#### 3.1 识别项目类型
```
根据议题关键词识别：
- "前端/界面/页面" → 前端项目
- "后端/服务/API" → 后端项目
- "AI/智能/模型" → AI项目
- "DevOps/部署/CI" → DevOps项目
```

#### 3.2 确定参与人数
```
复杂度映射：
| 复杂度 | 政协 | 人大 |
|--------|------|------|
| simple | 2 | 1 |
| medium | 3 | 2 |
| complex | 4 | 3 |
| enterprise | 5 | 5 |
```

#### 3.3 分配身份
```javascript
// 常驻身份（优先使用）
const residentBindings = {
  'npc-1': '系统架构师',
  'npc-2': '风险评估师',
  'cppcc-1': 'DevOps专家',
  'cppcc-2': '后端专家'
};

// 根据项目类型补充特定身份
// 如AI项目：cppcc-3 → AI工程师
```

#### 3.4 广播身份分配
```javascript
const message = `【步骤3：角色分工】

身份分配：

政协委员（协商建议）：
- cppcc-1：DevOps专家 — 提案权、建议权、协商权
- cppcc-2：后端专家 — 提案权、建议权、协商权

人大代表（审议决策）：
- npc-1：系统架构师 — 审议权、质询权、决策权
- npc-2：风险评估师 — 审议权、质询权、决策权

请确认你的身份和权限，简短回复"确认"。`;
```

#### 3.5 收集确认
#### 3.6 用户验收

### 验收标准
- [ ] 身份分配合理
- [ ] 所有Agent回复确认
- [ ] 用户验收通过

---

## 步骤4：协调机制

### 目的
建立会议的沟通规则、决策机制、时间约束。

### 需要什么
- 协调模式
- 通信协议
- 决策规则
- 同步机制

### 怎么做

#### 4.1 确定协调模式
```
复杂度 → 协调模式：
- simple → 集中式（main主导）
- medium → 混合式（main协调+Agent自主）
- complex/enterprise → 分布式（多Agent协作）
```

#### 4.2 定义决策规则
```
投票规则：
- 少数服从多数
- 赞成 > 反对 → 通过
- 反对 > 赞成 → 否决
- 平票 → 需要重新讨论

一票否决权：
- 安全风险
- 合规违规
- 重大技术债务
```

#### 4.3 设置超时
```
超时配置：
| 阶段 | 超时时间 |
|------|----------|
| 步骤1-4 | 每步5分钟 |
| 步骤5-1 | 10分钟 |
| 步骤5-2 | 5分钟 |
| 步骤6-1 | 5分钟 |
| 步骤6-2 | 10分钟 |
| 步骤6-3 | 5分钟 |
```

#### 4.4 广播协调机制
```javascript
const message = `【步骤4：协调机制】

协调模式：${coordinationMode}

决策规则：
- 投票方式：少数服从多数
- 通过条件：赞成 > 反对
- 一票否决：安全风险、合规违规

时间约束：
- 每阶段超时：${timeout}分钟
- 总会议时长：不超过${maxDuration}分钟

请确认你已了解规则，简短回复"确认"。`;
```

#### 4.5 收集确认
#### 4.6 用户验收

### 验收标准
- [ ] 规则清晰
- [ ] 所有Agent回复确认
- [ ] 用户验收通过

---

## 步骤5：政协协商（两轮）

### 步骤5-1：独立输出

#### 目的
政协委员在不看他人意见的情况下，独立分析议题。

#### 需要什么
- 纯净议题（不含任何背景引导）
- 专业身份

#### 怎么做

##### 5-1.1 发送纯净议题
```javascript
// 重要：消息必须纯净，不包含任何引导性内容
const message = `【步骤5-1：独立输出】

【开放性议题】
${topic}

请独立思考，给出你的方案。无任何预设答案。

要求：
- 不看他人意见
- 从你的专业视角分析
- 给出具体建议
- 简短回复（200字内）`;

// 仅发送给政协委员
sessions_send({ sessionKey: "agent:cppcc-1:main", message, timeoutSeconds: 0 });
sessions_send({ sessionKey: "agent:cppcc-2:main", message, timeoutSeconds: 0 });
// ...
```

##### 5-1.2 收集独立意见
```
通过 inter_session 接收回复
记录到：state.opinions[agentId]
不主动回复，仅记录
```

##### 5-1.3 验证独立性
```
统计意见分歧率：
- 一致率 > 80% → 可能未独立思考，警告
- 一致率 < 80% → 正常，继续
```

##### 5-1.4 ⚠️ 同步屏障（关键）

**问题：** sessions_send是异步的，无法确保所有政协响应完成后再进入5-2。

**解决方案：**
```javascript
// 5-1发送后，等待所有政协响应或超时
async function waitForAllOpinions(meetingId, expectedCount, timeout = 60000) {
  const startTime = Date.now();
  const opinions = {};
  
  while (Object.keys(opinions).length < expectedCount) {
    // 检查是否超时
    if (Date.now() - startTime > timeout) {
      console.warn(`同步屏障超时，已收集 ${Object.keys(opinions).length}/${expectedCount}`);
      break;
    }
    
    // 等待inter_session消息
    await sleep(5000);
    
    // 从会议状态中读取已收集的意见
    const state = loadState(meetingId);
    Object.assign(opinions, state.opinions);
  }
  
  return opinions;
}
```

**超时降级策略：**
| 响应比例 | 处理方式 |
|----------|----------|
| 100% | 正常进入5-2 |
| ≥60% | 使用已收集意见，标记缺失 |
| <60% | 警告用户，等待或取消 |

### 步骤5-2：意见共享 + 立场标记

#### 目的
政协委员参考他人意见后，选择立场。

#### 需要什么
- 其他委员的意见汇总
- 立场选项

#### 怎么做

##### 5-2.1 汇总并广播他人意见
```javascript
const otherOpinions = `
cppcc-1（DevOps专家）意见：
${opinions['cppcc-1']}

cppcc-2（后端专家）意见：
${opinions['cppcc-2']}
`;

const message = `【步骤5-2：意见共享+立场标记】

其他政协委员的意见：

${otherOpinions}

请参考他人意见，选择你的立场：

- 附议：完全同意某人的意见
- 补充：同意但需补充论证
- 反对：不同意并说明理由
- 独立：保持独立意见

简短回复你的立场和理由。`;
```

##### 5-2.2 收集立场
```
记录立场到：state.opinions[agentId].stance
记录理由到：state.opinions[agentId].reason
```

### 验收标准
- [ ] 所有政协委员提交独立意见
- [ ] 所有政协委员选择立场
- [ ] 意见分歧率正常

---

## 步骤6：人大表决（三轮）

### 步骤6-1：质询

#### 目的
人大代表对政协提案提出质疑，确保方案经过充分审查。

#### 需要什么
- 政协提案汇总
- 质询问题

#### 怎么做

##### 6-1.1 发送政协提案给人大的
```javascript
const proposalSummary = `
政协提案汇总：
${summarizeProposals(opinions)}

主要建议：
${extractMainSuggestions(opinions)}
`;

const message = `【步骤6-1：质询】

${proposalSummary}

作为人大代表，请提出至少1个质疑问题。

要求：
- 从全局视角审视方案缺陷
- 关注风险、可行性、架构合理性
- 每人至少提出1个问题

简短回复你的质询问题。`;

// 仅发送给人大代表
sessions_send({ sessionKey: "agent:npc-1:main", message, timeoutSeconds: 0 });
sessions_send({ sessionKey: "agent:npc-2:main", message, timeoutSeconds: 0 });
// ...
```

##### 6-1.2 收集质询问题
```
记录到：state.inquiries[npcId]
验证每人至少有1个问题
```

### 步骤6-2：政协回应质询

#### 目的
政协委员回应人大质询，补充论证或澄清。

#### 需要什么
- 质询问题列表
- 回应内容

#### 怎么做

##### 6-2.1 广播质询给政协
```javascript
const inquiries = Object.entries(state.inquiries)
  .map(([npcId, data]) => `${npcId}的质询：\n${data.questions.join('\n')}`)
  .join('\n\n');

const message = `【步骤6-2：政协回应质询】

人大代表提出的质询：

${inquiries}

请回应质询，补充论证或澄清。

简短回复你的回应。`;

// 仅发送给政协委员
sessions_send({ sessionKey: "agent:cppcc-1:main", message, timeoutSeconds: 0 });
```

##### 6-2.2 收集回应
```
记录到：state.inquiryResponses[cppccId]
```

### 步骤6-3：投票

#### 目的
人大代表投票表决，做出最终决策。

#### 需要什么
- 完整提案
- 质询回应
- 投票选项

#### 怎么做

##### 6-3.1 发送最终提案
```javascript
const message = `【步骤6-3：投票】

最终提案：
${finalProposal}

质询回应：
${inquiryResponses}

请投票：
- 赞成：同意该提案
- 反对：不同意该提案
- 弃权：不参与表决

投票必须附带理由，简短回复你的投票和理由。`;

// 仅发送给人大代表
sessions_send({ sessionKey: "agent:npc-1:main", message, timeoutSeconds: 0 });
```

##### 6-3.2 统计投票
```javascript
const result = {
  赞成: countVotes('赞成'),
  反对: countVotes('反对'),
  弃权: countVotes('弃权')
};

// 少数服从多数
if (result.赞成 > result.反对) {
  decision = '通过';
} else if (result.反对 > result.赞成) {
  decision = '否决';
} else {
  decision = '需要重新讨论';
}
```

### 验收标准
- [ ] 每位人大提出至少1个质询
- [ ] 政协回应所有质询
- [ ] 所有人大投票并附带理由

---

## 步骤7：决策输出

### 目的
输出最终决策，记录会议结果。

### 需要什么
- 投票结果
- 决策内容
- 后续步骤

### 怎么做

#### 7.1 生成决策文档
```javascript
const decision = {
  meetingId: state.meetingId,
  topic: state.topic,
  
  // 会议产物
  goalDocument: state.stepResults.goal_alignment,
  contextPackage: state.stepResults.information_sharing,
  roleMatrix: state.stepResults.role_assignment,
  
  // 协商结果
  deliberation: {
    round1: state.opinions,
    round2: { /* 立场标记 */ }
  },
  
  // 表决结果
  voting: {
    inquiries: state.inquiries,
    responses: state.inquiryResponses,
    votes: state.votes,
    summary: {
      赞成: result.赞成,
      反对: result.反对,
      弃权: result.弃权
    }
  },
  
  // 最终决策
  decision: decision,
  reason: "少数服从多数",
  
  // 后续步骤
  nextSteps: generateNextSteps(decision),
  
  // 时间戳
  decidedAt: new Date().toISOString()
};
```

#### 7.2 持久化存储
```javascript
// 保存到文件
saveState(state);

// 更新MEMORY.md
appendMemory(decision);
```

#### 7.3 通知用户
```
向用户展示：
- 决策结果
- 投票统计
- 后续步骤
```

### 验收标准
- [ ] 决策文档完整
- [ ] 状态已持久化
- [ ] 用户收到通知

---

## 消息处理规则

### sessions_send 使用
```javascript
// 发送消息给Agent（不等待回复）
sessions_send({
  sessionKey: "agent:cppcc-1:main",
  message: "消息内容",
  timeoutSeconds: 0  // 重要：避免双响应
});
```

### inter_session 处理
```
收到 inter_session 消息时：

1. 识别消息来源
   - provenance.kind === "inter_session"
   - 显示为 [Inter-session message] 前缀

2. 处理动作
   ✅ 记录到会议状态
   ✅ 收集Agent回复
   ❌ 不要主动回复

3. 原因
   - sessions_send 已返回结果
   - inter_session 是系统路由
   - 避免每条消息触发双重响应
```

---

## 异常处理

### 超时处理
```
某步骤超时后：
1. 记录超时事件
2. 通知用户
3. 等待用户决策：
   - 继续：忽略未回复的Agent
   - 重试：重新发送消息
   - 终止：结束会议
```

### 分歧过大
```
意见一致率 > 80%：
1. 警告可能未独立思考
2. 提示用户关注
3. 考虑重新协商
```

### 投票平局
```
赞成 = 反对：
1. 决策：需要重新讨论
2. 收集更多意见
3. 再次投票
```

---

## 文件结构

```
workspace/
├── meetings/                    # 会议记录
│   └── meeting-{id}.json       # 单次会议状态
│
├── scripts/                     # 核心脚本
│   ├── democratic-meeting-system.js  # 会议系统
│   ├── improved-meeting-flow.js      # 改进流程
│   └── meeting-state-store.js        # 状态存储
│
├── docs/                        # 文档
│   ├── meeting-system-flow.md        # 运行链路
│   ├── agent-meeting-guide.md        # Agent指南
│   └── seven-steps-guide.md          # 本文档
│
├── SOUL.md                      # 主控身份
├── AGENTS.md                    # 工作区规范
└── MEMORY.md                    # 长期记忆
```

---

_更新: 2026-03-26 21:30_