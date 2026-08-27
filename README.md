# 🐼 PandaClaw — 民主协商多智能体会议系统

[![npm](https://img.shields.io/npm/v/dsh-pandaclaw)](https://www.npmjs.com/package/dsh-pandaclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Protocol](https://img.shields.io/badge/协议-v2.9-blue)
![Evidence](https://img.shields.io/badge/背书-57卡制度调研·6份ADR·28项冒烟-success)

给 agent 团队加一间「议事厅」：对主会话说一句「**开个会：〈议题〉**」，它就按中国双轨协商制度（政协提案＋人大审议）组一场会——政协委员写意见书、人大代表交叉质询、机械计票表决，未过半自动提炼焦点打回重议。协议中所有可机械化的裁决点**下沉为代码强制**，不是一段君子协定的提示词；浏览器侧多出「**会议舞台**」页签，案卷号、阶段进度条、计票实况全程直播。每条条款溯源核验过的现实制度事实（57 卡调研），历次裁定以 ADR 治理。

整个插件是**一个包、一行装配**：宿主半边（`PandaClawService`＋8 个模型工具）与浏览器半边（`dsh-pandaclaw/client` 会议舞台）从同一 `package.json` 构建，npm 包与仓库都携带预构建产物与 `dsh-manifest.json`，克隆即装。

## 安装

前置：agent-team 底座（如 [dsh-team](https://github.com/huxint/dsh-team)）：

```sh
dsh plugin --profile web add dsh-team
```

安装 PandaClaw（二选一）：

```sh
dsh plugin --profile web add dsh-pandaclaw                                    # npm（已发布）
dsh plugin --profile web add https://github.com/omeyb110674401-rgb/pandaclaw.git  # 或本仓库直装
```

验证装配与启动：

```sh
dsh --profile web --dump-config | findstr pandaclaw   # 应看到 bundle 层标记
dsh --profile web                                      # 新会话视图环出现「会议舞台」页签即成功
```

卸载：`dsh plugin --profile web remove dsh-pandaclaw`。Headless／单发 profile 需先补 storage/storage-json/storage-domain 三行（见 [`patches/headless-team-patch.yml`](patches/headless-team-patch.yml)）；无记录域时本插件拒绝装配——有意设计。

## 快速开始

对装好插件的助手说一句话即可，未指定类型时按你的处境推荐：

> 开个会：是否引入灰度发布制度

想指定就带参数：

> 开个协商型会议讨论灰度发布方案，验收档 key

### 选哪类会议？

| 你的处境 | 类型 | 会中被打扰几次 | 散会拿到什么 |
|---|---|---|---|
| 例会留痕、快速共识 | 纪要型 MIN | ≈0 次（自动确证） | 确证纪要 |
| 方案明确快速拍板 | 决议型 RES | 默认 0 次（skip 档） | 决议 |
| 重大议题系统方案、有争议 | 协商型 CON | 关键阶段 1–2 次 | 决议＋意见处置清单 |
| 中长期规划编制 | 规划型 PLA | 关键阶段请示 | 纲要（预期性/约束性分列） |
| 顶层战略部署 | 战略型 STR | 内圈裁定＋终审一致同意门 | 战略决议 |
| 制度/规范/标准制定 | 立法型 LEG | 公示期＋逐条反馈 | 条文＋备案记录 |

### 会中只有三种事会来找你

1. **验收门三选**（full/key 档）：放行 ／ 附意见打回重议 ／ 终止——你的实质意见会转为焦点进下一轮协商，而不是直写决议；
2. **征询呈报三选**（应答率不足时）：采信归档（标注未达法定状态）／ 再议一轮 ／ 终止；
3. **监督窗口**：你随时可以质疑——会中代录入板（原汁原味不改写），会后走复审。

其余一切（组队、催办、合议、计票、成文）主持人自主完成，进度在会议舞台实时可见。

## 它强制了什么

纯技能只是君子协定；以下裁决点全部由服务端确定性执行：

| 协议条款 | 技能层（指引） | 插件层（强制） |
|---|---|---|
| M1 机械计票 | 公式说明 | `赞成＞编制÷2`／终批 `≥2/3`／STR 一致同意 由服务计算 |
| 表决前置门 | 流程图 | 本阶段缺已收录意见书/质询 → 投票与计票直接拒绝 |
| 全链顺序 | 阶段表 | 六类会议状态机，跳步即报错 |
| 三审制 ≤3 轮 | 条款 | 服务端轮次计数，超额拒绝开新一轮 |
| 准入硬项 | 审查清单 | 字限与一事一案当场拒收退回 |
| 身份纪律 | persona | 名单外拒绝；首用绑定席位会话，异会话冒名被拦并留审计字段 |
| 监督窗口双门 | 流程说明 | ⭐阶段计票前须先有 `warning` 关窗预告＋`supervision` 监督记录，否则 `pc_tally` 直接拒绝（ADR-0008/0009）；监督替身由服务层在门二受阻时自动派发（ADR-0010） |
| 复审回告闭环 | 流程说明 | 主力档（RES/LEG）归档即入池＋归档位点批量泵自动出审（按优先级，征询采信优先）；次级/弱档用户在场 request/dispatch 专项开启；降级标记唯一=征询采信；六阶段状态机逐段机械推进（审查替身只见结构化审查包，异议方陈述须在 hearing 收窗，出口三选未裁不可回告，回告未齐不可闭环）——全部服务端强制（ADR-0010）；**执行韧性（ADR-0011）**：启动扫描重建滞留档案、spawn 失败回滚留池、替身死亡 dispose 自动重泵、`restart` 逃生门、恢复动作 review-event 落板；归档门禁（ADR-0010 Q17/Q18）——表决阶段必有计票记录（决定必经表决）；审查意见三分类（维持/建议修订/建议解释，撤销=修订子形态）；修订新卷正常入池＋谱系双向入档（originDocId/上轮审查结论注入审查包）；解释性决议同效力同义务（同卷再开一轮） |

## 模型看到的工具

| 工具 | 谁能用 | 作用 |
|---|---|---|
| `pc_convene` | 主席台 | 建会发文：分配案卷号、按编制组队、定验收档 |
| `pc_stage` | 主席台 | 阶段机推进／回路打回（轮次计数、裁定门校验在此拦截） |
| `pc_record` | 主席台 | 登记文书锚点：焦点／裁定／决议／**关窗预告(warning)／监督代录(supervision)**（双联交付的处置清单随决议成文） |
| `pc_tally` | 主席台 | 机械计票：验证应答率门槛→按类型公式裁决→落库直播（⭐阶段还校验关窗预告与监督应答双门） |
| `pc_adjourn` | 主席台 | 归档散会（须有决议锚点）或搁置终止 |
| `pc_inspect` | 主席台 | 档案取数：生成正式公文前必须以此为准，禁止凭记忆编造字段 |
| `pc_rebind` | 主席台 | 席位认证重绑（ADR-0007）：成员断线重启后，核实身份并转移绑定权威至新会话 |
| `pc_review` | 主席台 | 复审回告闭环（ADR-0010/0011）：登记复审意见(request)／专项出审(dispatch docIds)／听证收窗／出口三选(adjudicate)／分级批量驳回(batch-dismiss，仅「维持」可批量)／逐条回告(reply)／重启复审(restart，替身卡死逃生门)／落地关联(link)；主力档归档由服务层批量泵自动出审 |
| `pc_submit` | 成员 | 交意见书／质询／答辩（过准入审查，超限当场退回） |
| `pc_vote` | 成员 | 选票／确证书（一人一票不可更改，重复票拒绝） |
| `pc_review_statement` | 异议方 | 复审沟通纠正阶段的被动陈述（ADR-0010 Q12/Q13）：原会议反对票成员以其身份陈述异议论据 |
| `pc_supervise` | 监督替身 | 缺席用户的会中监督代言（ADR-0009/0010）：提监督质疑、不算票、用户可撤回 |
| `pc_review_verdict` | 审查替身 | 复审审查意见直写（ADR-0010 Q6/Q7）：只见结构化审查包，产出建议性审查意见＋逐条处置清单（不经主持人代录） |

## 架构一览

```
浏览器  conversation.view「会议舞台」页签
        顶栏统计＋状态筛选 · 案卷卡：案卷号/类型/阶段进度条(⭐回路r1-r3)/当前阶段/名册席位
        监督窗口四态(开放/即将关闭/二阶段替身/已关窗) · 复审面板(六阶段状态行) · 计票历史(全轮次·征询标注)
        记录流(种类筛选/退回理由) · 复审意见/回告标签 · 空态快速开始卡
          ▲ faceOf('pandaclaw') 快照推送（客户端零折叠）
主机    PandaClawService（会议核心）── PandaClawStore（领域仓库）──自有记录域 pandaclaw(meetings/records/tallies)
        ├ ReviewService（复审领域类：ReviewSpawner→AgentHost 派发替身）
        ├ AgentHost（底座装配抽象：工具装备策略 · 替身创建/清理 · 5B 兜底 · 启动恢复）
        ├ 主席台 8 工具(普通会话) ├ 成员 2 工具(子代理作用域) ├ 异议方陈述 1 工具(成员面)
        ├ 监督替身 1 工具(专用 preset) └ 审查替身 1 工具(专用 preset, 服务层 spawn)
底座    dsh-team 等 agent-team 插件：成员创建 · 消息投递 · managed 纪律（经 AgentHost 契约可替换）
```

- **记录域自有**：成员产物经工具直落库，零转录造假空间；换任何 agent-team 底座，协议层不受影响（底座依赖收敛在 `AgentHost` 契约内，ADR-0012）。
- **投影驱动 UI**：工具结果携带实体快照入日志，fold 重建看板，框架推送到浏览器。
- **模块化结构（1.8.0）**：`src/store.ts` 领域仓库（纯数据访问）＋`src/review.ts` 复审领域类（状态机/泵/恢复/出口）＋`src/host.ts` 底座装配抽象（`makeAgentHost`）＋`src/service.ts` 会议核心与壳转发＋`src/review-tools.ts`/`src/client/review-panel.tsx` 工具面与面板归位（ADR-0012）。

## 制度依据

每条条款可溯源到核验过的现实制度事实（四线调研 **57 卡**，一手原文优先）：

| 调研线 | 覆盖 |
|---|---|
| [A 人大制度](docs/research/A-人大制度.md) | 立法法全文核验／议事规则／过半数口径／备案审查／公示期时限（+20 补验卡） |
| [B 政协制度](docs/research/B-政协制度.md) | 章程／专题协商／承办答复分类学／社情民意入口（+19 补验卡） |
| [C 公文体系](docs/research/C-公文体系.md) | GB/T 9704／15 文种解剖／代字规则／惯用句式语料库（+13 补验卡） |
| [D 四类文件](docs/research/D-四类文件.md) | 工作报告形成流程／规划衔接／白皮书／公开建言反馈闭环（+13 补验卡） |

M1-M17 逐条裁定见 [docs/协议校准底稿.md](docs/协议校准底稿.md)；架构裁定沿革见 [docs/adr/](docs/adr/)（0001–0007：两层会议模型／确证书语义／收敛单点化／征询呈报三选／程序性批复／监督窗口／席位认证解锚）。

## 已知限制

- **同队互冒名不设防**：席位绑定拦得住「别的会话冒用名字」，拦不住拿到他人会话的身份；审计字段保证事后可追责。
- **一会一卷合流**：服务层尚无独立的「会议」实体，名册与阶段表挂在案卷 doc 上（ADR-0001 两层模型中名册属会议级）；舞台 UI 口径已忠实术语表（统计与卡片按案卷），多案卷一会与总纪要待真实需求落地。
- **异议方唤醒依赖底座**：异议方（反对票成员）原会话在归档时保留，但复审 hearing 阶段的唤醒/投递依赖 dsh-team 底座能力；服务层只机械判定「是否全部陈述齐」，不生产唤醒消息——宿主未装配时 hearing 由主持人 `pc_review action=close-hearing` 收窗。
- **滞留记录不参与当轮计票**：成员产物以提交时刻的阶段/轮次为准，阶段推进后落库的滞留记录只进审计链。
- **Headless 需存储补丁**：单发环境回合即退出，协商屏障失效，需挂 storage 补丁并改走代录模式。

## 开发

```sh
pnpm install       # 第三方依赖走 .npmrc 配置的镜像源
pnpm run check     # typecheck + build + smoke（57 项端到端断言）+ 客户端渲染冒烟 + review.unit（9 组单测）
```

首次开发需把本机部署的 harness 包挂进依赖树（`@deepseek-ai/*` 未全量公开发布）：

```powershell
New-Item -ItemType Junction node_modules\@deepseek-ai `
  -Target "$env:USERPROFILE\.npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
```

构建产物（`dist/`）不入库（.gitignore），`files` 字段保证 npm 发包时从磁盘携带；改完源码先 `pnpm run build` 再发布。

## 文档导航

```
docs/roadmap.md                       # 后续迭代路线（57 项矩阵 + 版本带 + 完成定义，活文档）
src/                                  # 插件源码（host + client 双半包）
pandaclaw-meeting/SKILL.md            # 协议正文 v2.10（含 §0 使用地图）
docs/adr/                             # 架构裁定 0001–0012
docs/research/                        # 四线制度调研 57 卡
docs/协议校准底稿.md                   # M1-M17 制度裁决
docs/演练脚本.md                       # 两场实测记录
samples/                              # 演练产出公文
patches/headless-team-patch.yml       # headless 存储层补丁
templates/layout-gbt9704.yaml         # 公文版式工程化参数
prototype-v1/                         # v1.0 TypeScript 代码原型（历史版本）
```

## 版本

- **1.8.0** — 复审领域模块化与可替换装配（ADR-0012，协议 v2.13 不动）：复审 18 方法全量抽离为 `ReviewService` 领域类（`src/review.ts`）＋`PandaClawStore` 领域仓库（`src/store.ts`，纯数据访问）＋`AgentHost` 底座装配抽象（`src/host.ts`，`makeAgentHost` 收编替身派发/工具装备/5B 兜底/启动恢复/统一清理；`standinSpawnerHost` 兼容旧钩子）；`service.ts` 瘦身为会议核心＋12 壳转发（`get review` 属性直连）；复审工具面（`review-tools.ts`）与客户端复审面板（`review-panel.tsx`）归位；工具工厂四组导出（B′ 预设拼装锚点）；smoke 57 组零改动全绿（签名不变证明）＋新增 `review.unit` 单测（9 组 11 断言：CAS 并发/spawn 回滚/restart/dispose 兜底/恢复重建/谱系对称/解释再开轮/三分类批量/交卷销毁）。
- **1.7.0** — 复审执行模型韧性（ADR-0011，协议 v2.13）：启动扫描恢复（重建滞留 reviewing/accepted 档案→泵 filed）、spawn 失败回滚留池＋真串行、CAS 条件推进防并发重复出审、替身死亡 dispose 事件自动重泵、（`pc_review` 新增 `restart`）用户逃生门、恢复动作 `review-event` 系统事件落板、替身生命周期显式化（交卷/废弃即 dispose）＋启动清理死会话、监督替身纳入同一韧性框架；效力语义修正（ADR-0010 追加）：修订新卷正常入池＋谱系双向入档（originDocId＋上轮审查结论注入审查包）、解释性决议同效力同义务（同卷复审再开一轮）、归档门禁补表决合法性检查（决定必经表决）、审查意见三分类收敛（维持/建议修订/建议解释——「建议驳回」不再产出，撤销=修订子形态，batch-dismiss 仅「维持」可批量）。
- **1.6.0** — 复审回告闭环（ADR-0010，协议 v2.12）：已归档案卷六阶段复审（登记→受理→审查→沟通→出口→回告）；**复审模式分层**——主力档（RES/LEG）归档位点批量泵自动出审（按优先级，征询采信优先）、次级/弱档（PLA/STR/CON）用户在场专项开启、MIN 不复审；降级标记唯一=征询采信（验收 skip 非降级）；出口**分级批量驳回**（建议维持/驳回可 batch-dismiss，建议修订/解释逐件三选）；**去 AI 中介**——审查替身/监督替身均由服务层 spawn（`ctx.agents.create`，seed 空、setup 硬编码），审查替身只见结构化审查包（含降级标记）；异议方（反对票成员）原会话被动陈述；逐条回告闭环（立法法 §113 同构）；新增 `pc_review`/`pc_review_verdict`/`pc_review_statement`；监督替身派发从主持人迁至 tally 门二受阻服务层自动。
- **1.5.0** — 监督窗口两阶段（ADR-0008/0009，协议 v2.11）：`warning` 关窗预告＋`supervision` 监督记录做成 `pc_tally` 前置门（LLM 本地时钟）；用户缺席由监督替身（`pc_supervise`，专用 preset）代提、不算票可撤回；UI 监督窗口四态＋复审子通道入口。
- **1.4.0** — 会议舞台 UI 富化：顶栏统计与状态筛选、当前阶段行、计票历史全轮次（征询标注）、记录流种类筛选与退回理由、届层/验收档中文化；舞台口径忠实术语表（案卷为统计与卡片单元）；新增客户端渲染冒烟。
- **1.3.0** — 席位认证解锚制（ADR-0007，`pc_rebind`，协议 v2.10）；修复桌面端 locale 注入缺失。
- **1.2.0** — 客户端空态快速开始卡＋协议 v2.9 使用地图；npm 首发版本为 1.1.0（含征询呈报三选，ADR-0004）。
- v2.0.0 — 架构转型：代码原型 → dsh-team 伴生插件（协议强制＋会议舞台 UI），协议 v2.4。
- v1.0.0 — TypeScript 多智能体代码原型（保留于 `prototype-v1/`）。

## License

[MIT](LICENSE)
