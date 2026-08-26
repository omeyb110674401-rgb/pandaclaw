# 🐼 PandaClaw — 民主协商多智能体会议系统

**PandaClaw**: a deliberative decision-making system for AI agent teams that models China's dual-track consultative democracy (CPPCC 政协 + NPC 人大). Not a prompt — a protocol with code-level enforcement, shipped as a DeepSeek Harness community plugin (`dsh-pandaclaw`) on top of any agent-team base such as [dsh-team](https://github.com/huxint/dsh-team).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Protocol](https://img.shields.io/badge/协议-v2.4-实测校准-blue)
![Evidence](https://img.shields.io/badge/背书-3轮制度调研·54份文档·2场实战演练-success)

---

## 为什么不是「一段提示词」

纯技能只是君子协定。PandaClaw 把协议中所有**可机械化的裁决点下沉为代码强制**：

| 协议条款 | 技能层（指引） | 插件层（强制） |
|---|---|---|
| M1 机械计票 | 公式说明 | `赞成>编制÷2`／终批`≥2/3` 由服务确定性计算 |
| 红线2 表决前置门 | 流程图 | 本阶段缺已收录意见书/质询 → 投票与计票直接拒绝 |
| C9 全链顺序 | 阶段表 | 六类会议状态机，跳步即报错；末段自动收尾 |
| 三审制 ≤3 轮 | 条款 | 服务端轮次计数，超额拒绝开新一轮 |
| M4 准入硬项 | 审查清单 | 字限（意见书300/质询100/答辩100/票由80）与一事一案当场拒收退回 |
| 身份纪律 | persona | 名单外拒绝；首用绑定席位会话，异会话冒名被拦并留审计字段 |

## 架构一览

```
浏览器  conversation.view「会议舞台」页签
        会议卡：文号/类型/阶段进度条(⭐回路r1-r3)/名册席位
        计票实况条 · 记录流（最近8条）
          ▲ faceOf('pandaclaw') 快照推送（客户端零折叠）
主机    PandaClawService ──自有记录域 pandaclaw(meetings/records/tallies)
        ├ pc_convene pc_stage pc_record pc_tally pc_adjourn   ← 主席台(普通会话)
        └ pc_submit pc_vote                                   ← 成员(子代理作用域)
底座    dsh-team 等 agent-team 插件：成员创建 · 消息投递 · managed 纪律
```

- **记录域自有**：成员产物经工具直落库，零转录造假空间；换任何 agent-team 底座协议层不受影响。
- **投影驱动 UI**：工具结果携带实体快照入日志，fold 重建看板，框架推送到浏览器。
- **信任边界明示**：防程序越界；同队互冒名不设防，但审计字段让冒用事后可追责。

## 安装

### 前置：agent-team 底座（如 dsh-team）

```sh
dsh plugin --profile web add dsh-team
```

### 安装 PandaClaw

**方式 A — 从本仓库直接装（无需 npm 账号）：**

```sh
dsh plugin --profile web add https://github.com/omeyb110674401-rgb/pandaclaw.git
```

**方式 B — npm（发布后可用）：**

```sh
dsh plugin --profile web add dsh-pandaclaw
```

**Headless / 单发 profile**：需先给 profile 补 storage/storage-json/storage-domain 三行（见 [`patches/headless-team-patch.yml`](patches/headless-team-patch.yml) 与 [docs/迁移与验证计划.md](docs/迁移与验证计划.md)）；无记录域时本插件拒绝装配——这是有意设计。

### 仅要协议不要强制？（不推荐）

把 [`pandaclaw-meeting/SKILL.md`](pandaclaw-meeting/SKILL.md) 复制到 `~/.agents/skills/pandaclaw-meeting/` 即可当纯技能使用，但所有约束退化为模型自觉。

## 快速开始

对装好插件的 agent 说：

> 用 PandaClaw 开一场协商型会议（medium），议题：「是否引入灰度发布制度」，成功标准：出可执行的灰度流程草案

系统将：建会发文分配文号 → 组队（3 政协委员提案 + 2 人大代表审查，全 managed）→ R0 出题 → 成员用 pc_submit 交意见书（超限当场退回）→ 交叉质询 → 合议修订（登记 draft 锚点）→ pc_vote 点名表决（前置门校验）→ pc_tally 机械计票 → 未过半则提炼焦点打回重议（≤3 轮）→ 通过后成文归档，会议舞台页签全程直播进度。

两场完整演练检查点见 [docs/演练脚本.md](docs/演练脚本.md)；示例公文见 [samples/](samples/)。

## 制度依据

每条条款可溯源到核验过的现实制度事实（三轮调研 54 份文档）：

| 调研线 | 代表文档 |
|---|---|
| A 人大制度（立法法/议事规则/过半数口径/备案审查） | [docs/research/A-人大制度.md](docs/research/A-人大制度.md) +19 补验 |
| B 政协制度（章程/双周座谈/专题协商） | [docs/research/B-政协制度.md](docs/research/B-政协制度.md) +18 补验 |
| C 公文体系（GB/T 9704/15文种/代字规则） | [docs/research/C-公文体系.md](docs/research/C-公文体系.md) +15 补验 |
| D 四类文件（工作报告/规划衔接/白皮书） | [docs/research/D-四类文件.md](docs/research/D-四类文件.md) +13 补验 |

M1-M17 逐条裁定见 [docs/协议校准底稿.md](docs/协议校准底稿.md)。

## 开发

```sh
pnpm install        # 第三方依赖走 .npmrc 配置的镜像源
pnpm run check      # typecheck + build + smoke（19 项端到端断言）
```

首次开发需把本机部署的 harness 包挂进依赖树（`@deepseek-ai/*` 未全量公开发布）：

```powershell
New-Item -ItemType Junction node_modules\@deepseek-ai `
  -Target "$env:USERPROFILE\.npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
```

## 文档导航

```
src/                                  # 插件源码（host + client 双半包）
pandaclaw-meeting/SKILL.md            # 协议正文 v2.4（技能形态）
docs/                                 # 制度调研、校准底稿、演练记录
templates/layout-gbt9704.yaml         # 公文版式工程化参数
patches/headless-team-patch.yml       # headless 存储层补丁
samples/                              # 两份演练产出公文
prototype-v1/                         # v1.0 TypeScript 代码原型（历史版本）
```

## 版本

- **v2.0.0** — 架构转型：代码原型 → dsh-team 伴生插件 `dsh-pandaclaw`（协议强制 + 会议舞台 UI），协议 v2.4。
- v1.0.0 — TypeScript 多智能体代码原型（保留于 `prototype-v1/`）。

## License

[MIT](LICENSE)
