# PandaClaw 接口契约

**创建时间：** 2026-03-27 23:09
**负责人：** npc-1（系统架构师）
**协调者：** npc-5（智能体编排者）

---

## 一、目录结构

```
contracts/
├── api.ts              # API接口定义（含健康检查）
├── events.ts           # 事件类型定义（含版本字段）
├── messages.ts         # 消息格式定义（含版本字段）
└── state.ts            # 状态类型定义（含错误码枚举）
```

---

## 二、模块职责

| 模块 | 负责人 | 依赖契约 |
|------|--------|----------|
| core/ | cppcc-2（后端专家） | api.ts, events.ts, state.ts |
| messaging/ | cppcc-2（后端专家） | messages.ts, events.ts |
| ui/ | cppcc-5（前端专家） | api.ts, state.ts |
| integration/ | npc-2（AI工程师） | api.ts, messages.ts |
| resilience/ | cppcc-1（DevOps专家） | events.ts |

---

## 三、同步机制

**协调者：** npc-5（智能体编排者）

**同步时机：**
1. 接口变更时 → 广播通知所有相关Agent
2. 每日固定时间 → 进度同步会
3. 依赖阻塞时 → 紧急协调

**同步方式：**
- 共享文档更新后，由协调者通知相关Agent
- 各Agent开发前必须先读取最新契约

---

## 四、接口版本控制

- v1: 初始版本
- v2: 向后兼容扩展
- v3: 允许breaking change（需协调者审批）

**所有消息、事件、状态对象必须包含version字段，用于兼容性检查。**

---

## 五、开发流程

```
1. 读取 contracts/ 最新契约
       ↓
2. 开发模块代码
       ↓
3. 提交前检查契约兼容性
       ↓
4. 通知协调者更新状态
```

---

## 六、类型规范

| 规范 | 说明 |
|------|------|
| 时间戳 | 统一使用`number`（毫秒），不使用`Date` |
| 版本字段 | 所有顶层对象必须包含`version: number` |
| 错误码 | 使用`ErrorCode`枚举，不使用字符串 |
| 类型安全 | 禁止`any`，使用泛型或`unknown` |

---

_所有Agent开发前必须先阅读本目录下的契约文件_