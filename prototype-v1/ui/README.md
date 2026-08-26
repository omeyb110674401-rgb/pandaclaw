# PandaClaw UI

民主协商决策系统前端模块

**负责：** 前端专家 (cppcc-5)

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3+ | UI框架 |
| TypeScript | 5.5+ | 类型安全 |
| Zustand | 4.5+ | 状态管理 |
| Vite | 5.3+ | 构建工具 |

---

## 目录结构

```
ui/
├── src/
│   ├── components/         # UI组件
│   │   ├── MeetingDashboard.tsx    # 会议仪表盘
│   │   ├── StepIndicator.tsx       # 步骤指示器
│   │   ├── ParticipantsPanel.tsx   # 参与者面板
│   │   ├── VotePanel.tsx           # 投票面板
│   │   └── LiveIndicator.tsx       # 实时状态
│   │
│   ├── store/              # 状态管理
│   │   └── meetingStore.ts         # Zustand store
│   │
│   ├── hooks/              # 自定义钩子
│   │   └── useWebSocket.ts         # WebSocket连接
│   │
│   ├── types/              # 类型定义
│   │   └── index.ts                # 基于契约
│   │
│   ├── mock/               # 模拟数据
│   │   └── data.ts
│   │
│   ├── styles/             # 样式
│   │   └── components.css
│   │
│   ├── App.tsx             # 根组件
│   ├── main.tsx            # 入口
│   └── index.css           # 全局样式
│
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 验收标准

| 指标 | 目标 | 实现方式 |
|------|------|---------|
| UI响应时间 | < 100ms | React.memo + useMemo |
| 实时同步 | WebSocket | useWebSocket hook |
| 类型安全 | 100% | 契约驱动 |

---

## 快速开始

```bash
# 安装依赖
cd pandaclaw/ui
npm install

# 开发模式
npm run dev

# 类型检查
npm run type-check

# 构建
npm run build
```

---

## 组件说明

### MeetingDashboard

主仪表盘组件，整合所有子组件。

```tsx
import { MeetingDashboard } from './components';

<MeetingDashboard meeting={meeting} />
```

### StepIndicator

七步闭环进度指示器。

```tsx
<StepIndicator currentStep={5} status="step5-deliberation" />
```

### ParticipantsPanel

政协委员和人大代表面板。

```tsx
<ParticipantsPanel
  cppcc={meeting.participants.cppcc}
  npc={meeting.participants.npc}
/>
```

### VotePanel

投票结果展示。

```tsx
<VotePanel
  decisions={meeting.decisions}
  npcParticipants={meeting.participants.npc}
/>
```

---

## 状态管理

使用 Zustand + Immer 实现不可变状态更新：

```tsx
import { useMeetingStore } from './store/meetingStore';

// 获取状态
const { currentMeeting, isConnected } = useMeetingStore();

// 更新状态
useMeetingStore.getState().setMeeting(meeting);
```

---

## WebSocket 实时同步

```tsx
import { useWebSocket } from './hooks/useWebSocket';

const { isConnected, send } = useWebSocket({
  url: 'ws://localhost:8080/ws/meeting/xxx',
});
```

---

## 契约遵循

所有类型定义基于 `contracts/api.ts`：

```typescript
import type { Meeting, MeetingStatus, Participants } from '../types';
```

---

_前端专家 (cppcc-5) 开发维护_