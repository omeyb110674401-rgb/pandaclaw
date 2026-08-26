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

## 模型看到的工具

| 工具 | 谁能用 | 作用 |
|---|---|---|
| `pc_convene` | 主席台 | 建会发文：分配案卷号、按编制组队、定验收档 |
| `pc_stage` | 主席台 | 阶段机推进／回路打回（轮次计数、裁定门校验在此拦截） |
| `pc_record` | 主席台 | 登记文书锚点：焦点／裁定／决议（双联交付的处置清单随决议成文） |
| `pc_tally` | 主席台 | 机械计票：验证应答率门槛→按类型公式裁决→落库直播 |
| `pc_adjourn` | 主席台 | 归档散会（须有决议锚点）或搁置终止 |
| `pc_inspect` | 主席台 | 档案取数：生成正式公文前必须以此为准，禁止凭记忆编造字段 |
| `pc_submit` | 成员 | 交意见书／质询／答辩（过准入审查，超限当场退回） |
| `pc_vote` | 成员 | 选票／确证书（一人一票不可更改，重复票拒绝） |

## 架构一览

```
浏览器  conversation.view「会议舞台」页签
        顶栏统计＋状态筛选 · 会议卡：案卷号/类型/阶段进度条(⭐回路r1-r3)/当前阶段/名册席位
        计票历史(全轮次·征询标注) · 记录流(种类筛选/退回理由) · 空态快速开始卡
          ▲ faceOf('pandaclaw') 快照推送（客户端零折叠）
主机    PandaClawService ──自有记录域 pandaclaw(meetings/records/tallies)
        ├ 主席台 6 工具(普通会话) └ 成员 2 工具(子代理作用域)
底座    dsh-team 等 agent-team 插件：成员创建 · 消息投递 · managed 纪律
```

- **记录域自有**：成员产物经工具直落库，零转录造假空间；换任何 agent-team 底座，协议层不受影响。
- **投影驱动 UI**：工具结果携带实体快照入日志，fold 重建看板，框架推送到浏览器。

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
- **滞留记录不参与当轮计票**：成员产物以提交时刻的阶段/轮次为准，阶段推进后落库的滞留记录只进审计链。
- **Headless 需存储补丁**：单发环境回合即退出，协商屏障失效，需挂 storage 补丁并改走代录模式。

## 开发

```sh
pnpm install       # 第三方依赖走 .npmrc 配置的镜像源
pnpm run check     # typecheck + build + smoke（31 项端到端断言）+ 客户端渲染冒烟
```

首次开发需把本机部署的 harness 包挂进依赖树（`@deepseek-ai/*` 未全量公开发布）：

```powershell
New-Item -ItemType Junction node_modules\@deepseek-ai `
  -Target "$env:USERPROFILE\.npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
```

构建产物（`dist/`）不入库（.gitignore），`files` 字段保证 npm 发包时从磁盘携带；改完源码先 `pnpm run build` 再发布。

## 文档导航

```
src/                                  # 插件源码（host + client 双半包）
pandaclaw-meeting/SKILL.md            # 协议正文 v2.10（含 §0 使用地图）
docs/adr/                             # 架构裁定 0001–0007
docs/research/                        # 四线制度调研 57 卡
docs/协议校准底稿.md                   # M1-M17 制度裁决
docs/演练脚本.md                       # 两场实测记录
samples/                              # 演练产出公文
patches/headless-team-patch.yml       # headless 存储层补丁
templates/layout-gbt9704.yaml         # 公文版式工程化参数
prototype-v1/                         # v1.0 TypeScript 代码原型（历史版本）
```

## 版本

- **1.4.0** — 会议舞台 UI 富化：顶栏统计与状态筛选、当前阶段行、计票历史全轮次（征询标注）、记录流种类筛选与退回理由、届层/验收档中文化；新增客户端渲染冒烟。
- **1.3.0** — 席位认证解锚制（ADR-0007，`pc_rebind`，协议 v2.10）；修复桌面端 locale 注入缺失。
- **1.2.0** — 客户端空态快速开始卡＋协议 v2.9 使用地图；npm 首发版本为 1.1.0（含征询呈报三选，ADR-0004）。
- v2.0.0 — 架构转型：代码原型 → dsh-team 伴生插件（协议强制＋会议舞台 UI），协议 v2.4。
- v1.0.0 — TypeScript 多智能体代码原型（保留于 `prototype-v1/`）。

## License

[MIT](LICENSE)
