# 🐼 PandaClaw — 民主协商多智能体会议系统

**PandaClaw**: a multi-agent deliberative decision-making system that models China's dual-track consultative democracy (CPPCC 政协 + NPC 人大) on top of the [dsh-team](https://github.com/huxint/dsh-team) plugin for DeepSeek Harness. Give your agent team a real procedural protocol — not just a chat room.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Skill Version](https://img.shields.io/badge/skill-v2.4-实测校准-blue)
![Evidence](https://img.shields.io/badge/背书-3轮制度调研·54份文档·2场实战演练-success)

---

## 这是什么

让 AI agent 团队像真实制度一样做决策：**政协委员（cppcc）提案协商，人大代表（npc）审查表决，主持人居中合议但不投票**。所有交流经主持人转发，全程板书留痕，结论必经机械计票产生。

```
                    ┌─────────────────────────────┐
                    │   主持人（主会话 leader）      │
                    │   出题 · 转发质询 · 合议 · 计票 │
                    │  （不提案 / 不投票 / 不站队）    │
                    └──────────┬──────────────────┘
                     team_send │ team_note 板书
              ┌────────────────┼────────────────┐
        提案协商 ▼            质询转发 ▼          表决 ▼
   ┌──────────────┐    ┌──────────────┐   ┌──────────────┐
   │ cppcc 政协委员 │    │ npc 人大代表  │   │ vote-* 选票   │
   │ 意见书/答辩    │◄───│ 书面质询      │──►│ 机械计票 M1    │
   └──────────────┘    └──────────────┘   └──────────────┘
        成员全部 managed（禁止横向消息），一切留痕可审计
```

## 核心机制

| 机制 | 说明 |
|---|---|
| **六类会议矩阵** | 纪要 MIN / 决议 RES / 协商 CON / 规划 PLA / 战略 STR / 立法 LEG——每类有独立阶段流与验收模式 |
| **协商回路 R0-R4** | 出题 → 独立陈述 → 交叉质询 → 合议修订（双联交付：修订文本＋意见处置清单）→ 表决归档 |
| **机械表决 M1** | 通过 = `赞成 > 全体npc数÷2`；弃权计入分母（算术上等同反对，源自宪法第64条表决实践）；重大事项终批 ≥2/3 |
| **准入审查 M4** | 意见书先审后录：一事一案、有分析有建议，不合格退回重提、原稿留痕不删除 |
| **三审制重议** | 打回→提炼反对焦点→重议，同一议题总轮次 ≤3；搁置两个周期自动终止 |
| **双维度配置** | 复杂度 simple(2+1)/medium(3+2)/complex(4+3)/enterprise(5+5) × 验收门 full/key/skip |
| **公文产出** | 按文号代字规则成文，红头版式参数（GB/T 9704）、纪要/决议/意见征集等分类型骨架 |

## 安装

### 前置：dsh-team 插件

```sh
dsh plugin --profile web add dsh-team
# enterprise 档（5+5=10人）需覆写 maxTeammates ≥12，见 docs/迁移与验证计划.md
```

### 安装技能

**方式 A — skills CLI（推荐）：**

```sh
npx skills add omeyb110674401-rgb/pandaclaw@pandaclaw-meeting -g
```

**方式 B — 手动安装：**

把 [`pandaclaw-meeting/SKILL.md`](pandaclaw-meeting/SKILL.md) 复制到 `~/.agents/skills/pandaclaw-meeting/SKILL.md`。

**Headless / 无人值守用户（可选）：** 单发模式下回合屏障失效，需叠加 [`patches/headless-team-patch.yml`](patches/headless-team-patch.yml) 并按 SKILL 内「运行形态前提」改用 workflow 同步委托。

## 快速开始

对装好技能的 agent 说：

> 用 PandaClaw 开一场协商型会议（medium），议题：「是否引入灰度发布制度」，成功标准：出可执行的灰度流程草案

系统将自动：建会发文（`PC-CON〔2026〕001号`）→ 组队（3 政协委员 + 2 人大代表，全 managed）→ R0 出题 → 各委员独立提交意见书 → 准入审查 → 交叉质询与限期答辩 → 主持人合议修订（附逐条意见处置清单）→ 点名表决 → 未过半则提取反对焦点打回重议（≤3 轮）→ 通过后生成正式公文存档。

**无人值守单发形态：**

```sh
dsh --profile headless "用 pandaclaw-meeting 技能开一场纪要型会议……"
```

两场完整演练的检查点记录见 [docs/演练脚本.md](docs/演练脚本.md)；示例产物见 [samples/](samples/)：

- [`PC-MIN〔2026〕001号.md`](samples/PC-MIN〔2026〕001号.md) — 纪要型最小闭环产物
- [`PC-CON〔2026〕001号.md`](samples/PC-CON〔2026〕001号.md) — 协商型全回路产物（含一轮真实打回重议：首轮 0赞/2反 → 焦点提炼 → 二轮 2赞/0反）

## 制度依据（为什么这些规则长这样）

本系统的每条协议条款都可溯源到经过核验的现实制度事实，三轮调研共 54 份文档：

| 调研线 | 覆盖内容 | 代表文档 |
|---|---|---|
| A 人大制度 | 立法法、议事规则、过半数分母口径、人事任免表决粒度、备案审查 | [A-人大制度.md](docs/research/A-人大制度.md) + 19 份补验 |
| B 政协制度 | 章程总纲、年度协商计划、双周座谈选题机制、专题协商组织流程 | [B-政协制度.md](docs/research/B-政协制度.md) + 18 份补验 |
| C 公文体系 | GB/T 9704 版式核对、15 文种结构解剖、代字编排规则全集、惯用句式语料库 | [C-公文体系.md](docs/research/C-公文体系.md) + 15 份补验 |
| D 四类文件 | 政府工作报告形成流程、规划三级三类衔接、白皮书立项与翻译审定 | [D-四类文件.md](docs/research/D-四类文件.md) + 13 份补验 |

裁决汇总：M1-M17 逐条裁定见 [docs/协议校准底稿.md](docs/协议校准底稿.md)；总体框架见 [docs/PandaClaw现实模型结构调研.md](docs/PandaClaw现实模型结构调研.md)。

> 例：为什么「弃权算反对」？——《宪法》第64条修正案表决实践中以全体代表为分母，弃权计入分母不计入分子，算术效果等同反对（详见 [A-补-P07-弃权算术旁证.md](docs/research/A-补-P07-弃权算术旁证.md)）。

## 文档导航

```
docs/
├── PandaClaw现实模型结构调研.md     # 总纲：民主集中制双轨框架与映射
├── 协议校准底稿.md                  # 条款级裁决工作底稿（M1-M17 + 迭代记录）
├── 演练脚本.md                      # 两场实战演练脚本与检查点结果
├── 迁移与验证计划.md                 # dsh-team 安装、enterprise 配置、回滚
└── research/                        # 三轮调研 54 份原始产出
templates/layout-gbt9704.yaml        # 公文版式工程化参数
patches/headless-team-patch.yml      # headless profile 存储层补丁
prototype-v1/                        # v1.0 TypeScript 代码原型（历史版本）
```

## 版本

- **v2.0.0**（当前）— 架构转型：从代码原型转为 **dsh-team 技能包**。协议 v2.4 实测校准版，两场演练全绿。
- v1.0.0 — TypeScript 多智能体代码原型（保留于 `prototype-v1/`）。

## License

[MIT](LICENSE)
