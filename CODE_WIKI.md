# 率土模拟器 · Code Wiki

> 本文档面向接手本仓库的开发者，系统梳理**项目架构、模块职责、关键类与函数、依赖关系与运行方式**。
> 阅读顺序建议：`§1 项目概览` → `§2 运行方式` → `§3 整体架构` → 按需深入 `§4 引擎` / `§5 数据` / `§6 前端` / `§7 AI 顾问` / `§8 肉鸽`。
> 更细的「口径纪律」（哪些行为是刻意设计、勿改动）以仓库根的 [AGENTS.md](file:///workspace/AGENTS.md) 与 [docs/](file:///workspace/docs) 调研文档为准。

---

## 目录

1. [项目概览](#1-项目概览)
2. [运行方式](#2-运行方式)
3. [整体架构](#3-整体架构)
4. [核心引擎层（src/engine）](#4-核心引擎层srcengine)
5. [数据层（src/data）](#5-数据层srcdata)
6. [前端层（web/）](#6-前端层web)
7. [AI 配将顾问子系统（web/advisor）](#7-ai-配将顾问子系统webadvisor)
8. [卡牌肉鸽模式（src/rogue + web/rogue）](#8-卡牌肉鸽模式srcrogue--webrogue)
9. [Android 壳（android/ + capacitor）](#9-android-壳android--capacitor)
10. [脚本与数据链（scripts/）](#10-脚本与数据链scripts)
11. [测试与质量保障（tests/）](#11-测试与质量保障tests)
12. [依赖关系总览](#12-依赖关系总览)
13. [关键设计口径与约束](#13-关键设计口径与约束)
14. [扩展指南：新增一名武将](#14-扩展指南新增一名武将)
15. [术语表](#15-术语表)

---

## 1. 项目概览

**率土模拟器**（包名 `stzb-battle-engine`）是一个《率土之滨》式的**确定性回合制战斗模拟引擎**及其网页前端。

| 维度 | 内容 |
|------|------|
| 定位 | 纯逻辑 TypeScript 战斗引擎 + Vite 多页前端 + Capacitor 安卓壳 |
| 核心特性 | **同种子逐字节复现**（随机只经 `Rng`，mulberry32） |
| 战斗模型 | 8 回合制、斩首制胜负（大营阵亡即败）、兵种相克、士气、伤兵机制 |
| 战法系统 | 主动 / 准备 / 追击 / 指挥（一类·二类）/ 被动 五类，386 个战法 |
| 武将规模 | 库内登记 168 名五星，其中 104 名已上架（下架者主战法未实现或成长率未确认） |
| 许可证 | 自研代码 MIT；游戏素材（立绘/文案/数值）权利归网易，**不得商用** |

引擎层零 UI / 框架依赖，可被任意客户端调用，可单测、可 golden 快照锁死输出。

---

## 2. 运行方式

### 2.1 环境要求

- Node.js（`target: ES2022`，`module: ESNext`，strict 模式）
- 可选：MySQL（不可用时自动回退到 JSON 文件，见 [§5.2](#52-武将数据heroests)）

### 2.2 安装与常用命令

定义见 [package.json](file:///workspace/package.json)：

```bash
npm install

# ── 前端 ──
npm run web            # 启动 Vite 开发服务器（localhost:5173）
npm run web:host       # 同上，暴露到局域网（手机可访问）
npm run web:build      # 构建网页产物到 dist/
npm run preview:host   # 预览构建产物（:4173）

# ── 引擎 / 命令行 ──
npm run dev            # CLI 跑一场内置固定测试集，输出文本战报（默认 T1_PURE_ATTACK）
npm run dev -- T3      # 跑指定测试集
npm run dev -- --json T7_LOADOUT   # 同时输出 JSON 战报

# ── 诊断 ──
npm run diagnose       # tsx scripts/diagnose.mts（因果归因诊断）

# ── 测试 ──
npm test               # vitest run —— 全部测试
npm run test:watch     # vitest 监听
npm run golden         # 只跑 golden 快照测试
npx vitest run tests/conflict.test.ts   # 跑单文件
npx vitest run -t "连击"                 # 按测试名过滤
npx tsc --noEmit                        # strict 类型检查
```

> ✅ 以 `npm run web` 启动的 Vite dev server 默认监听 `0.0.0.0`（配置见 [vite.config.ts](file:///workspace/vite.config.ts)），同一局域网内手机可直接访问。

### 2.3 多页入口

Vite 构建入口（[vite.config.ts](file:///workspace/vite.config.ts#L11-L19)）共三个：

| HTML | 入口 TS | 说明 |
|------|---------|------|
| [index.html](file:///workspace/index.html) | [web/main.ts](file:///workspace/web/main.ts) | 主站：配将台 / 战报 / 预设 / 战法 / 伤害测试 / AI配将 / 教程 / 公告 |
| [advisor.html](file:///workspace/advisor.html) | [web/advisorPage.ts](file:///workspace/web/advisorPage.ts) | AI 配将顾问独立页 |
| [rogue.html](file:///workspace/rogue.html) | [web/rogue/app.ts](file:///workspace/web/rogue/app.ts) | 卡牌肉鸽模式 |

另有若干**未并入主站**的实验/工具页（直接在根目录，靠 Vite 直出）：`battle-sim.html`、`damage-model.html`、`round-model.html`、`optimize.html`、`optimizer.html`、`advisor-lab.html`。

### 2.4 CLI 入口

[src/cli.ts](file:///workspace/src/cli.ts)：加载武将库（`initHeroDB`）→ 取内置固定测试集（`tests/fixtures.ts` 的 `buildAllFixtures()`）→ `runBattle` → `reportToText` 渲染文本战报；`--json` 时额外打印完整 JSON。

---

## 3. 整体架构

### 3.1 分层结构

```
┌────────────────────────────────────────────────────────────┐
│  页面入口层   index.html / advisor.html / rogue.html        │
│              + 若干独立实验页 (damage-model / optimize ...) │
├────────────────────────────────────────────────────────────┤
│  前端 UI 层   web/*.ts   （配将 / 战报 / 统计 / 工具）       │
│  AI 顾问      web/advisor/*                                 │
│  肉鸽 UI      web/rogue/*                                  │
├────────────────────────────────────────────────────────────┤
│  肉鸽逻辑     src/rogue/*   （纯逻辑，可脱离浏览器测试）     │
├────────────────────────────────────────────────────────────┤
│  数据层       src/data/*    （战法/武将/宝物/兵种/百家/...)  │
│              web/data/*.json（前端消费的生成物）            │
├────────────────────────────────────────────────────────────┤
│  引擎层       src/engine/*  （纯逻辑 TS，零 UI 依赖）        │
│              combat → action → formulas / target            │
│              stats / report / diagnosis / rng               │
└────────────────────────────────────────────────────────────┘
                          │
   android/ (Capacitor 8) ─┘  套一层 WebView 打包 APK
```

### 3.2 核心数据流

```
BattleConfig (双方 General[] + seed + maxRounds)
        │
        ▼
 runBattle (combat.ts)  ── 准备阶段 + 8 回合主循环
        │  产出
        ▼
  events: BattleEvent[]   ← 引擎唯一的结构化输出，事件流驱动一切
        │
        ├─► computeStats / computeDetailedStats / computeContributionShares (stats.ts)
        ├─► reportToText (report.ts)                → CLI 文本战报
        ├─► diagnoseBattle (diagnosis.ts)           → 因果归因诊断
        └─► BattleReport（含 finalTroops + events + stats）→ 前端战报/统计渲染
```

**关键设计**：战斗过程只产出一条 `BattleEvent[]` 事件流，统计、诊断、战报渲染**全部是对事件流的只读消费**，互不侵入引擎逻辑。

---

## 4. 核心引擎层（src/engine）

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| [rng.ts](file:///workspace/src/engine/rng.ts) | 确定性伪随机（mulberry32） | `class Rng` |
| [types.ts](file:///workspace/src/engine/types.ts) | 全部核心类型定义（~2700 行） | `General` `UnitState` `Skill` `Status` `BattleEvent` `BattleReport` `BattleConfig` |
| [combat.ts](file:///workspace/src/engine/combat.ts) | 战斗主循环入口 | `runBattle` `ensureUniqueUnitIds` `buildTurnOrder` `buildPriorityOrder` |
| [action.ts](file:///workspace/src/engine/action.ts) | 行动 / 状态 / 战法执行 / 伤害结算（~10.6k 行，核心运行时） | `actUnit` `inflictStatus` `applyDamage` `effectiveStat` `tickStatuses` `CombatContext` |
| [formulas.ts](file:///workspace/src/engine/formulas.ts) | 伤害 / 恢复 / 系数公式 | `calcDamage` `calcHealAmount` `troopCounterFactor` `moraleRate` |
| [target.ts](file:///workspace/src/engine/target.ts) | 实时距离 / 目标选择 | `distanceBetween` `skillTargets` `nearestEnemy` `attackRangeOf` |
| [stats.ts](file:///workspace/src/engine/stats.ts) | 事件流统计汇总 | `computeStats` `computeDetailedStats` `computeContributionShares` |
| [report.ts](file:///workspace/src/engine/report.ts) | 文本战报渲染 | `reportToText` `renderEventLines` |
| [diagnosis.ts](file:///workspace/src/engine/diagnosis.ts) | 因果归因诊断（只读） | `diagnoseBattle` `diagnoseBatch` `DIAGNOSIS_THRESHOLDS` |
| [diagnosisReport.ts](file:///workspace/src/engine/diagnosisReport.ts) | 诊断文本渲染 | `diagnosisToText` `batchDiagnosisToText` |
| [troopBonus.ts](file:///workspace/src/engine/troopBonus.ts) | 阵容/势力/称号/兵种加成 | `computeTroopBonuses` |
| [secondaryTroop.ts](file:///workspace/src/engine/secondaryTroop.ts) | 二级兵种（高级兵种）规则表 | `SECONDARY_TROOPS` `traitsFor` `traitCombatModifiers` |
| [treasure.ts](file:///workspace/src/engine/treasure.ts) | 宝物效果结算 | `applyTreasureEffects` `triggerTreasureRoundStart` |
| [treasure-source.ts](file:///workspace/src/engine/treasure-source.ts) | 宝物来源标记工具 | `isTreasureSource` `treasureLabel` |
| [baijia.ts](file:///workspace/src/engine/baijia.ts) | 百家副将效果注入 | `applyBaijia` |

### 4.1 `rng.ts` — 确定性之源

```ts
export class Rng {
  constructor(seed: number)   // mulberry32
  next(): number              // [0,1)
  // + int/range/pick/chance 等封装
}
```

引擎内**禁止**出现 `Math.random`。一切随机都经此 RNG，因此同一 `seed` 永远产出同一场战斗。这条纪律由 golden 快照测试（[tests/golden.test.ts](file:///workspace/tests/golden.test.ts)）守卫。

### 4.2 `types.ts` — 类型系统

**核心运行时类型：**

- **`General`**（[types.ts#L2000](file:///workspace/src/engine/types.ts#L2000-L2086)）：武将配置。含面板（attack/defense/strategy/speed/attackRange/maxTroops）、四类战法槽（`activeSkillIds` / `passiveSkillIds` / `commandSkillIds` / `pursuitSkillIds`）、`position`（大营/中军/前锋）、`morale`、可选 `treasure`、`secondaryTroop` + `secondaryTraits`、`baijia`、`gender`、`tags`、`mutualExclusionGroup`（SP 互斥组）。
- **`UnitState`**（[types.ts#L2400](file:///workspace/src/engine/types.ts#L2400)）：战斗中的运行时单位。包裹 `general` + `side` + 当前 `troops` / `wounded` / `totalDead` / `alive` / `statuses[]` / `preparations[]`。
- **`Skill`**：**判别联合**（discriminated union），见 [types.ts#L1954](file:///workspace/src/engine/types.ts#L1954)。五类成员：
  - `SimpleActiveSkill`（瞬发主动）
  - `PreparedActiveSkill`（需准备 1 回合的主动）
  - `PursuitSkill`（追击）
  - `CommandSkill`（指挥，`phase: 'prep' | 'round'`）
  - `PassiveSkill`（被动）
  - 公共字段：`id / name / type / range / triggerRate / targetMode / tags / output`；`output` 是另一个大判别联合（`SkillOutput`，[types.ts#L150](file:///workspace/src/engine/types.ts#L150)），描述该战法的实际效果。
- **`Status`**（[types.ts#L2258](file:///workspace/src/engine/types.ts#L2258)）：状态实例，携带 `type`（`StatusType` 联合）、`duration` / `remaining` / `stacks` / `sourceSkillId` / `sourceSkillType`。
- **`BattleEvent`**（[types.ts#L2432](file:///workspace/src/engine/types.ts#L2432)）：**事件流联合类型**（战斗过程的结构化记录）——`battle_start` / `prep_phase` / `formation_bonus` / `round_start` / `skill_cast` / `damage` / `heal` / `status_inflicted` / `status_expired` / `round_end` / `battle_end` 等。
- **`BattleReport`**（[types.ts#L2739](file:///workspace/src/engine/types.ts#L2739)）：`runBattle` 的返回值 = 种子 + 双方原始 `General` + 最终兵力/伤兵/阵亡 + `events[]` + `stats`。
- **`BattleConfig`**（[types.ts#L2128](file:///workspace/src/engine/types.ts#L2128)）：输入配置。除双方队伍与 `seed` / `maxRounds` 外，还有：
  - `woundedMortality`：伤兵机制（默认 `{ deathRate: 5, woundedDecayRate: 14 }`）
  - `defenderSide`：防守方阵营（二级兵种「作为防守方时」条件用）
  - `fieldBattle`：野地/城池作战
  - `inertSides`：**木桩侧**（该侧不还手，供伤害期望测评当纯输出靶子）

### 4.3 `combat.ts` — 战斗主循环

`runBattle(config)`（[combat.ts#L61](file:///workspace/src/engine/combat.ts#L61-L250)）是引擎唯一入口：

1. **红蓝同将去重**（`ensureUniqueUnitIds`）：两队可能上阵同一武将，引擎全程用 `general.id` 作单位身份，冲突则改写成 `原id#2` 并把原始 id 记入 `heroId`。无重复时为 no-op。
2. **同队互斥校验**（`validateMutualExclusion`）：SP 与普通重名武将不可同队。
3. 构造 `CombatContext`（`rng` / 两队 `UnitState` / `events` / `skills` 合并注册表 / 各类计数器）。
4. **准备阶段**：阵容加成写入 → 速度排序 → `formation_bonus` 事件 → 二级兵种状态授予 → 宝物结算 → `battle_start` 被动 → 一类指挥（`triggerCommandSkills`）。
5. **8 回合主循环**：
   - 回合开始：伤兵池阵亡结算 → `tickRoundStartStatuses` → 宝物回合窗口 → 延迟输出 → 重排行动顺序 → 逐单位 `actUnit`（行动前检查斩首）。
   - 回合结束：被动攻击距离递减 → 一类指挥回合末结算 → `tickStatuses` → `round_end` 事件。
6. **胜负判定（斩首制）**：一侧大营阵亡即败（`backGeneralAlive`）；无大营配置退化为全员存活判定。
7. 生成 `battle_end` 事件，返回完整 `BattleReport`（含 `computeStats`）。

**出手顺序**：
- `buildTurnOrder`（[combat.ts#L268](file:///workspace/src/engine/combat.ts#L268)）：速度降序 → 同速按站位（前锋 > 中军 > 大营）。
- `buildPriorityOrder`（[combat.ts#L278](file:///workspace/src/engine/combat.ts#L278)）：每回合重排，带 `priorityRounds` 的单位（先驱突击 / 疾行特性 / 二级兵种先发等）先手，再按当前生效速度。

### 4.4 `action.ts` — 运行时核心（最庞杂）

这是引擎的主体（~10,650 行），负责单将行动、状态生命周期、战法执行、伤害/恢复结算。

**单将行动序列**（`actUnit`，[action.ts#L2893](file:///workspace/src/engine/action.ts#L2893)）：

```
被动 → 指挥预备判定(目标行动时) → 二类指挥判定 → 混乱检查 → 怯战检查
    → 准备战法检查 → 主动战法（逐槽独立判定）→ 普通攻击（连击至多 2 次）
    → 追击战法
```

**要点**：

- **准备槽**（`UnitState.preparations`）：每个准备主动各占一格 `{ skillId, left }`，同一武将可同时准备多个；释放回合只跳过被释放的那个战法，其余照常判定。
- **被动判定顺序**：同优先级按**战法顺序**逐槽结算（主战法槽先判定，装配战法按添加顺序）。
- **一类 vs 二类指挥**：一类（`phase:'prep'`）只在准备阶段释放一次，按准备时兵力/属性结算，施法者阵亡后效果仍在；二类（`phase:'round'`）看局内实时数据，施法者兵力为 0 后失效。

**关键导出**（按调用链）：

- 战法触发：`triggerPassiveSkills` / `triggerCommandSkills` / `triggerActiveSkill` / `triggerPreparedEffectOnAct` / `triggerDelayedOutputs` / `triggerPendingRoundOutputs` / `triggerRoundStartChance` / `triggerRoundEndCommands` / `triggerRoundEndChanceOutputs`
- 状态管理：`inflictStatus`（冲突/同源刷新/叠层规则入口）、`tickStatuses` / `tickRoundStartStatuses`（两组递减时点）、`hasStatus` / `getStatus` / `consumeEvasion` / `removeDebuffs`
- 数值结算：`effectiveStat`（生效属性 = 面板 + 加成 + 状态）、`effectiveMorale`、`applyDamage`、`dealDotDamage`、`recoverTroops`、`decayWoundedPool`、`sumReduce`、`statusMatchesHit`
- 伤害上下文：`DamageHitContext`、`damageClassKey`

**同源重复施加 / 冲突规则**集中在 `inflictStatus`（同源先判状态类型，再按同源刷新或叠层处理；两组状态有各自的递减时点）。

### 4.5 `formulas.ts` — 公式

| 函数 | 作用 |
|------|------|
| `troopBaseDamage(troops, damageType)` | 兵力基础伤害 |
| `attrFactor(diff)` | 属性差因子 |
| `buffMult(causedMult, takenMult, reduce)` | **单一总和模型** `m = clamp(1 + Σcaused + Σtaken − Σreduce, 0.1)` |
| `moraleRate(morale)` | 士气系数（120 → 1.12） |
| `troopCounterFactor` / `troopCounterReduce` | 兵种克制因子 / 减伤 |
| `calcDamage(input, rng)` | 总伤害计算，返回 `{ damage, breakdown }` |
| `calcHealAmount(troops, rate, healBoost)` | 恢复量（恢复率 + 恢复值） |
| `applyTroopCap` / `applyIgnoreDef` | 兵力上限截断 / 无视防御 |
| `scaledValue(base, growthRate, strategy)` | 受属性成长缩放 |

> 伤害公式权威口径见 [dateyuan/战斗伤害公式调研.md](file:///workspace/dateyuan/战斗伤害公式调研.md)。

### 4.6 `target.ts` — 实时距离与目标

- `distanceBetween(ctx, attacker, defender)`：实时距离（随前排阵亡而缩短）。
- `attackRangeOf` / `skillRangeOf`：普攻距离 / 战法距离（含二级兵种 `rangeModOf`）。
- `skillTargets(ctx, ...)` / `nearestEnemy` / `unitsInSkillRange` / `adjacentUnits`：按 `targetMode` 选目标、找相邻单位。

### 4.7 `stats.ts` — 事件流统计

| 函数 | 输出 |
|------|------|
| `computeStats(events, units)` | 每单位基础统计（普攻/战法次数、伤害、恢复） |
| `computeDetailedStats(events, units)` | 展开到技能级的明细 |
| `computeContributionShares(events, units)` | 每单位贡献占比 |

对应类型：`UnitStats` / `UnitDetailedStats` / `UnitShareStats` / `SkillStat` / `SkillKiller`。

### 4.8 `diagnosis.ts` — 因果归因诊断（只读，零侵入）

设计约束（勿破坏）：

1. **数据来源 = 引擎既有事件流**，不新增埋点、不改战斗逻辑、不重跑引擎。
2. 只做读取与聚合，**不被主循环引用**（线上零开销，有测试守卫）。
3. 支持单场（`diagnoseBattle`）或一批（`diagnoseBatch`，自动按队伍指纹分组找共性问题）。
4. 反推量标注口径：结构化实证记 `confirmed`，估算记 `estimated`。

**核心思路**：由伤害事件携带的 `modifiers`（caused/taken/reduce 三方向）**反解基线伤害** `baseline = (base + main) / m`，于是每条来源的绝对贡献 = `baseline × rate`，账本闭合 `Σ贡献 = 实际 − 基线`。另含覆盖率（回放 `status_inflicted`→`status_expired` 区间）、被控回合、兵种克制应交与实交、主战法空转证据、技能顺序缺口（同行动窗口内后施加的增减伤吃不到前面的伤害）。

阈值集中在 `DIAGNOSIS_THRESHOLDS`（[diagnosis.ts#L55](file:///workspace/src/engine/diagnosis.ts#L55-L68)），全部可覆盖且写进输出保证结论可审计。权威口径见 [docs/诊断工具.md](file:///workspace/docs/诊断工具.md)。

### 4.9 `troopBonus.ts` / `secondaryTroop.ts` / `treasure.ts` / `baijia.ts`

- **`computeTroopBonuses(generals)`**：计算势力、称号、兵种等阵容加成，输出 `byUnit` 映射与 `lines`（供 `formation_bonus` 事件）。
- **`SECONDARY_TROOPS`**：二级兵种规则表（每兵种 1 专属特性 + 2 通用特性栏，通用特性按兵系成池）。
- **`applyTreasureEffects` / `triggerTreasureRoundStart`**：宝物效果（纯提升、与任何来源不冲突，准备阶段最先结算）。
- **`applyBaijia(g)`**：百家副将（第二战法槽）效果注入。

---

## 5. 数据层（src/data）

| 文件 | 职责 |
|------|------|
| [skills.ts](file:///workspace/src/data/skills.ts) | **战法定义库**（~11,752 行），`SKILL_REGISTRY: Record<string, Skill>`，386 个战法 |
| [baijia.ts](file:///workspace/src/data/baijia.ts) | 百家战法 `BAIJIA_SKILLS` 与百家武将 `BAIJIA_HEROES` |
| [heroes.ts](file:///workspace/src/data/heroes.ts) | 武将加载（MySQL → JSON 回退）、`HERO_REGISTRY` / `HERO_RECORDS`、`initHeroDB` |
| [hero-utils.ts](file:///workspace/src/data/hero-utils.ts) | `HeroRecord → General` 转换、等级/自由加点、互斥校验 |
| [listing.ts](file:///workspace/src/data/listing.ts) | 上架/下架清单：`OFFLINE_MAIN_SKILLS`、`isHeroListed` |
| [treasures.ts](file:///workspace/src/data/treasures.ts) | 宝物系统数据（`TREASURES` / `AFFIXES` / `treasureEffectValue`） |
| [secondaryTroops.ts](file:///workspace/src/data/secondaryTroops.ts) | 武将的二级兵种转换方向表 |
| [titles.ts](file:///workspace/src/data/titles.ts) | 称号定义 `TITLE_REGISTRY` |
| [mechanisms.ts](file:///workspace/src/data/mechanisms.ts) | 机制字典（`MECHANISM_DICT`、战法↔机制映射 `SKILL_MECHANISMS`） |

### 5.1 战法注册表（skills.ts）

`SKILL_REGISTRY` 的键为战法 id，值是 `Skill` 类型对象。每个战法声明 `id / name / type / range / triggerRate / targetMode / tags / output`。运行时 `runBattle` 会把 `SKILL_REGISTRY` 与 `BAIJIA_SKILLS` 合并成一张 `skills: Map` 供引擎查询。

### 5.2 武将数据（heroes.ts）

数据链存在**双源回退**：优先读 MySQL 的 `heroes` 表；MySQL 不可达时自动回退到 [web/data/heroes.json](file:///workspace/web/data/heroes.json)。工作树（DSH `.dsh/worktrees/<hash>/...`）会按路径推导独立库名 `stzb战斗系统_dsh_<hash>`，避免污染主库。两处逻辑（[heroes.ts](file:///workspace/src/data/heroes.ts) 与 [scripts/db-config.mjs](file:///workspace/scripts/db-config.mjs)）须同步修改。

关键导出：`initHeroDB(config)`、`getGeneral(id)`、`getHeroGrowth(id)`、`level40(g, free, troops)`。

### 5.3 上架/下架（listing.ts）

- `OFFLINE_MAIN_SKILLS`：主战法未实现或成长率未确认 → 对应武将暂下架。
- `isHeroListed(hero)`：是否上架。
- 下架武将仍可在「显示下架武将」中查看。完整清单见 [docs/下架武将清单.md](file:///workspace/docs/下架武将清单.md)（由 `scripts/gen_offline_report.mts` 生成）。

---

## 6. 前端层（web/）

### 6.1 主站（main.ts）

[web/main.ts](file:///workspace/web/main.ts) 是主站入口，组织顶栏导航与各视图挂载：

| 导航 | 视图模块 | 说明 |
|------|----------|------|
| 配将 | [teamEditor.ts](file:///workspace/web/teamEditor.ts) | 红蓝双方各 3 槽（大营/中军/前锋），等级/红度/加点/士气/宝物可调 |
| 战报 | [battleView.ts](file:///workspace/web/battleView.ts) / [battleSummary.ts](file:///workspace/web/battleSummary.ts) | 简略 / 详细 / 统计三视图 |
| 预设 | [presetStore.ts](file:///workspace/web/presetStore.ts) / [presetPanel.ts](file:///workspace/web/presetPanel.ts) | 阵容存取 |
| 战法 | [heroes.ts](file:///workspace/web/heroes.ts) / 战法详情 | 386 个战法速查 |
| 伤害测试 | [damageLab.ts](file:///workspace/web/damageLab.ts) | 可调参靶子，量单点数值 |
| AI配将 | [advisorPage.ts](file:///workspace/web/advisorPage.ts) | 跳转独立顾问页 |
| 教程 / 公告 | [tutorial.ts](file:///workspace/web/tutorial.ts) / [announcement.ts](file:///workspace/web/announcement.ts) | 上手流程 / changelog |

### 6.2 主要 UI 模块职责

| 模块 | 职责 |
|------|------|
| [teamEditor.ts](file:///workspace/web/teamEditor.ts) | 配将台核心：槽位渲染、英雄池筛选、英雄/战法/宝物详情弹窗、历史面板、拖拽 |
| [heroes.ts](file:///workspace/web/heroes.ts) | 前端武将数据与展示工具（`buildGeneral`、`attachSkills`、属性/画像/等级换算） |
| [battleSim.ts](file:///workspace/web/battleSim.ts) / [battleSimView.ts](file:///workspace/web/battleSimView.ts) | 触发模拟、对手池、战报生成 |
| [battleView.ts](file:///workspace/web/battleView.ts) / [battleSummary.ts](file:///workspace/web/battleSummary.ts) | 战报逐回合明细 / 汇总 |
| [damageLab.ts](file:///workspace/web/damageLab.ts) | 伤害测试实验室（`buildDummyTeam` / `buildGuardTeam` / `simulate`） |
| [presetStore.ts](file:///workspace/web/presetStore.ts) | 预设阵容的 localStorage 持久化 |
| [winRate.ts](file:///workspace/web/winRate.ts) / [winrateSearch.ts](file:///workspace/web/winrateSearch.ts) | 实战胜率批量模拟 |
| [teamConfig.ts](file:///workspace/web/teamConfig.ts) / [teamRoles.ts](file:///workspace/web/teamRoles.ts) / [teamScan.ts](file:///workspace/web/teamScan.ts) | 队伍配置建模、角色定位、扫描 |
| [opponentPool.ts](file:///workspace/web/opponentPool.ts) / [poolMatchup.ts](file:///workspace/web/poolMatchup.ts) | 对手池与胜率对拍 |
| [roundModel.ts](file:///workspace/web/roundModel.ts) | 回合期望模型（纯解析，独立工具页） |
| [damageModel.ts](file:///workspace/web/damageModel.ts) | 伤害数学模型（独立工具页） |
| [optimizer.ts](file:///workspace/web/optimizer.ts) / [optimizeView.ts](file:///workspace/web/optimizeView.ts) | 组合优化（L2 优化战法 / L3 优化武将） |
| [changelog.ts](file:///workspace/web/changelog.ts) | 公告数据 = 主站版本号唯一真源（`ANNOUNCEMENTS`） |

### 6.3 版本号纪律

`web/changelog.ts` 的 `ANNOUNCEMENTS`（版本倒序）是主站版本号唯一真源，`SITE_VERSION` 由它派生。每次上线必须在最前面加一条，`web/changelog.test.ts` 守卫格式/倒序/去重，漏写会红。详见 [docs/公告栏维护.md](file:///workspace/docs/公告栏维护.md)。

---

## 7. AI 配将顾问子系统（web/advisor）

一个完整的 LLM 工具调用子系统，纪律核心是 **「AI 不下场算数」**——所有数字只来自工具实跑，模型不得自编。

### 7.1 模块职责

| 模块 | 职责 |
|------|------|
| [router.ts](file:///workspace/web/advisor/router.ts) | **思考模式路由 / 工具面分档**（`TIER_TOOLS` / `classifyTiers` / `wireToolNames` / 首轮锚定），是线上工具面的单一真源 |
| [tools.ts](file:///workspace/web/advisor/tools.ts) | 工具实现（20+ 个，见下） |
| [gate.ts](file:///workspace/web/advisor/gate.ts) | **三阶段校验门**：合法性 / 数值可溯 / 标准口径复算 |
| [loop.ts](file:///workspace/web/advisor/loop.ts) | 对话循环（`runAdvisorTurn`）+ `SYSTEM_PROMPT` |
| [transport.ts](file:///workspace/web/advisor/transport.ts) | LLM 传输层（SSE 流式、工具调用拼装、`createBrowserTransport` / `createFakeTransport`） |
| [memory.ts](file:///workspace/web/advisor/memory.ts) | 记忆持久化（会话 + 证据清单 + 偏好档案 + box） |
| [prefs.ts](file:///workspace/web/advisor/prefs.ts) | 偏好档案抽取（轮末小请求） |
| [box.ts](file:///workspace/web/advisor/box.ts) | 识图建 box（上传截图 → 识别 → 确定性对齐库内 id） |
| [vision.ts](file:///workspace/web/advisor/vision.ts) | 截图识别（走同一模型 `once()`） |
| [cache.ts](file:///workspace/web/advisor/cache.ts) | 跑批缓存（`cacheKey` / `createLocalCache`） |
| [trace.ts](file:///workspace/web/advisor/trace.ts) | 一行轨迹（`TraceLine` / 工具中文名 `TOOL_ZH`） |
| [view.ts](file:///workspace/web/advisor/view.ts) | 顾问页 UI（`mountAdvisor`） |
| [evalCases.ts](file:///workspace/web/advisor/evalCases.ts) | 离线评测用例目录 |

### 7.2 工具清单（tools.ts）

按用途分组（见 [tools.ts](file:///workspace/web/advisor/tools.ts)）：

- **配置/校验**：`get_config`、`validate_plan`、`get_my_box`
- **模拟**：`simulate`、`simulate_many`
- **优化**：`optimize_skills`（L2 空槽换战法）、`optimize_mates`（L3 队友位）、`optimize_both`（交替搜索）、`optimize_template`、`optimize_winrate`
- **检索**：`search_hero`、`hero_detail`、`search_skill`、`list_skills`、`skill_detail`
- **对手池**：`list_opponent_pool`、`add_opponent_from_preset`、`remove_user_opponent`、`matchup_pool`、`compare_variants`
- **元工具（常驻）**：`tools_catalog`、`tools_help`、`route_task`

### 7.3 三阶段校验门（gate.ts）

`checkPlan(plan, trace, ctx)`（[gate.ts#L405](file:///workspace/web/advisor/gate.ts#L405)）串联：

1. **关 1 · 合法性**：`validateAdvisorPlan` — 互斥、槽位、box 范围等。
2. **关 2 · 数值可溯**：`verifyClaims` / `collectNumbers` / `uncitedBigNumbers` — 答案里的数值必须在工具证据（`ToolCallRecord[]`）中可追溯。
3. **关 3 · 标准口径复算**：`recomputePlan` + `judgeRecompute` — 用固定种子（`ADVISOR_VERIFY_SEED=20260929`，`ADVISOR_VERIFY_RUNS=20`）复算，`withinTolerance` 判定。

只有 `decideApply({legal, verified, recomputed})` 三项均通过，方案卡上的「应用」才可用。

### 7.4 记忆 / box / 路由

- **记忆口径**：会话 + 证据清单落 `dsh-advisor-session-v1`（轮末一次原子写）；偏好档案落 `dsh-advisor-profile-v1`（每轮以 `<advisor_prefs>` system 块注入，回灌时剥标签防自我污染）。
- **box**：上传五星武将/战法截图 → 用当前模型读图 → 名字交给 `box.matchRecognition` **确定性对齐**库内 id → 按用户分档案落 `dsh-advisor-box-v1`，每轮以 `<advisor_box>` 注入。**只在「给自己配将 / 出方案」时限定范围**，检索/测算法不受限制。
- **路由分档**：`base` / `search` / `write` 三档，`loop.ts` 每轮按档裁工具面；首轮锚定只发 4 个工具（大幅省 token）。

权威设计与评测记录见 [docs/AI配将顾问-设计.md](file:///workspace/docs/AI配将顾问-设计.md)、[docs/顾问评测-索引.md](file:///workspace/docs/顾问评测-索引.md)。

---

## 8. 卡牌肉鸽模式（src/rogue + web/rogue）

肉鸽模式的**逻辑层**在 `src/rogue`（纯函数，可脱离浏览器测试），**UI 层**在 `web/rogue`。

### 8.1 逻辑层（src/rogue）

| 文件 | 职责 |
|------|------|
| [run.ts](file:///workspace/src/rogue/run.ts) | 局状态：`createRun` / `applyOutcome`（胜 +1 关、败 −1 命、通关/死亡判定） |
| [economy.ts](file:///workspace/src/rogue/economy.ts) | 经济：玉符 `Wallet`、价格、目标胜率曲线 |
| [gacha.ts](file:///workspace/src/rogue/gacha.ts) | 抽卡（`drawFive` / `beginPull` / `pickFromPull` / `claimBonus`） |
| [pool.ts](file:///workspace/src/rogue/pool.ts) | 卡池：`createPool` / `addHero` / `addSkill` / `addTreasure` |
| [recruit.ts](file:///workspace/src/rogue/recruit.ts) | 招募成长（红度阶梯、兵力容量、`formatRecruit`） |
| [shop.ts](file:///workspace/src/rogue/shop.ts) | 商店（`shopListings` / `buySkill`） |
| [rewards.ts](file:///workspace/src/rogue/rewards.ts) | 通关奖励（`rollClearReward` / `applyClearReward`） |
| [enemy.ts](file:///workspace/src/rogue/enemy.ts) | 敌人生成（`rollEnemySlots` / `enemyGrowth` / `winRateVs`） |
| [loop.ts](file:///workspace/src/rogue/loop.ts) | 关卡循环（`buildMyTeam` / `settleLevel`） |
| [save.ts](file:///workspace/src/rogue/save.ts) | 存档（`SAVE_KEY='rogue.run.v1'`，可注入 `StorageLike` 供测试） |
| [types.ts](file:///workspace/src/rogue/types.ts) | `RunState` / `PoolState` / `EnemySlot` 等 |

### 8.2 UI 层（web/rogue）

[app.ts](file:///workspace/web/rogue/app.ts) 提供 `mountRogue(root, { storage?, seed? })`——所有视图（总览/抽卡/商店/卡池/出战）挂载于此，存储可注入因此测试不必碰浏览器存储。配套 `board.ts`（拖拽槽位）、`catalogue.ts`（目录/General 构造）、`team.ts`、`report.ts`、`shop.ts`、`gacha.ts`、`pool.ts`、`rogue.css`。

---

## 9. Android 壳（android/ + capacitor）

| 文件 | 职责 |
|------|------|
| [capacitor.config.ts](file:///workspace/capacitor.config.ts) | appId `io.github.ybytlai78dev.stzb`，`webDir: 'dist'`，沉浸式全屏 + 安全区桥接配置 |
| android/ | Gradle 工程；`MainActivity.java` 实现 edge-to-edge 全屏 + 安全区 CSS 变量注入 |

**构建链**：`npm run web:build` → `npx cap sync android` → Gradle 打包 APK。

**关键坑（已在配置中注释固化，勿改动）**：Capacitor 8 的 `SystemBars.insetsHandling: 'disable'`（避免 WebView < 140 时真机白边）+ 由 `MainActivity.installSafeAreaBridge()` 自己监听窗口 insets 写成 `--safe-area-inset-*`（只推变量、不 padding），配 [web/mobile.css](file:///workspace/web/mobile.css) 的 `var(--safe-*, env(safe-area-inset-*, 0px))` 双写。详见 [docs/移动端访问.md](file:///workspace/docs/移动端访问.md)。

---

## 10. 脚本与数据链（scripts/）

### 10.1 数据生成链

```bash
node scripts/build_heroes_seed.mjs        # SKILL_ID_BY_NAME → scripts/seed_heroes.sql
node scripts/gen_skill_data.mjs           # → web/data/skill_grades.json / skill_desc.json
node scripts/seed_db.mjs                  # MySQL 可用时灌库
node scripts/export_web_data.mjs          # MySQL 可用时导出 web/data/heroes.json
node scripts/sync_hero_mainskill.mjs <heroId> <skillId>   # MySQL 不可用时等效写 heroes.json
```

生成物（`web/data/*.json`、`scripts/seed_heroes.sql`）**随提交入库**，保证每个提交自洽、`npm test` 全绿。生成脚本已幂等。

### 10.2 其他脚本

| 脚本 | 用途 |
|------|------|
| `gen_secondary_troops.mjs` / `gen_treasure_data.mjs` | 二级兵种 / 宝物数据生成 |
| `derive_growth_rate.mjs` | 成长率反推 |
| `sim_expectation.mts` | 模拟期望测评 |
| `diagnose.mts` | 诊断 CLI（`npm run diagnose`） |
| `gen_offline_report.mts` | 按 listing 口径生成下架清单 |
| `advisor_eval.mts` | 真模型评测（`ADVISOR_KEY=... npx tsx scripts/advisor_eval.mts`） |
| `download_portraits*.mjs` / `map_portraits.mjs` / `gen_pinyin.mjs` | 立绘下载与映射、拼音生成 |
| `deploy-gh-pages.sh` | 部署到 GitHub Pages |
| `_*.mjs` / `_*.mts` | 一次性取证/审计脚本（下划线前缀 = 临时） |

---

## 11. 测试与质量保障（tests/）

测试用 [vitest](file:///workspace/package.json#L12)，约 280+ 个测试文件，分几大类：

| 类别 | 示例 |
|------|------|
| **Golden 快照** | [golden.test.ts](file:///workspace/tests/golden.test.ts)：锁定全部固定测试集输出，引擎行为的有意变更才会让它失败 |
| 伤害/公式 | `damage_model` / `damage_modifiers` / `formulas` / `attack_scale` / `caused_reduce` |
| 状态/冲突 | `conflict` / `status` / `repeat_inflict` / `mutual_exclusion` / `duration` |
| 战法（主战法逐个） | `main_skills_b*.test.ts`（大量批次）/ `main_skills_s2`（每战法 ≥3 测试） |
| 通用战法 | `universal_active_a/b` / `universal_b_plus_p1..p19` / `universal_command` / `universal_passive` / `universal_pursuit` |
| 兵种/宝物 | `secondary_troop*` / `treasure_*` / `troop_counter` / `troop_bonus` |
| 诊断 | `diagnosis.test.ts` |
| 顾问 | `advisor_gate` / `advisor_loop` / `advisor_tools` / `advisor_router` / `advisor_memory` / `advisor_transport` / `advisor_vision` / `advisor_eval` 等 |
| 前端 | `*_view.test.ts` / `smoke.test.ts` / `dataIntegrity.test.ts` |

**Golden 快照纪律**：引擎行为有意变更 → 确认后删除 `tests/__snapshots__/golden.json` 再跑一次重新生成。

---

## 12. 依赖关系总览

### 12.1 引擎内部依赖（自上而下）

```
combat.ts
 ├─ rng.ts
 ├─ action.ts ──► target.ts ──► formulas.ts
 │                └─► secondaryTroop.ts / treasure-source.ts / troopBonus.ts
 ├─ stats.ts
 ├─ troopBonus.ts
 ├─ treasure.ts
 ├─ baijia.ts ──► data/baijia.ts
 └─ data/skills.ts (SKILL_REGISTRY)   ← 数据层
```

- **`action.ts` 是依赖汇点**：几乎所有运行时逻辑都集中于此，并向下依赖 `target.ts` / `formulas.ts`。
- **`diagnosis.ts` / `diagnosisReport.ts` 是叶子**：只读事件流，**不被 combat/action 引用**（零开销守卫）。
- **`types.ts` 被所有文件引用**。

### 12.2 跨层依赖方向

```
web/*  ──►  src/engine/*  ──►  src/data/*
web/rogue/* ──► src/rogue/* ──► src/engine/* (构造 General、跑战斗)
web/advisor/* ──► src/engine/* (真实模拟) + web/* (配将区读写)
```

**重要**：`src/engine` 与 `src/rogue` **不得反向依赖 `web/`**——它们必须保持为可独立测试的纯逻辑。

### 12.3 外部依赖

| 依赖 | 用途 |
|------|------|
| `mysql2` | 武将数据从 MySQL 读取（可回退 JSON） |
| `@capacitor/*` | Android 壳 |
| `vite` / `vitest` / `tsx` / `typescript` / `jsdom` | 构建 / 测试 / 运行 / 类型检查 |
| `pinyin-pro` | 拼音搜索（`gen_pinyin.mjs`） |

---

## 13. 关键设计口径与约束

接手时**最需要知道的「不要破坏」项**（完整版见 [AGENTS.md](file:///workspace/AGENTS.md)）：

1. **确定性**：引擎内禁止 `Math.random`，一切随机只经 `Rng`（mulberry32）。同种子逐字节复现。
2. **事件流驱动**：战斗只产出 `BattleEvent[]`；统计/诊断/战报都是只读消费。
3. **诊断零侵入**：`diagnosis.ts` 不新增埋点、不改战斗逻辑、不被主循环引用。
4. **AI 不下场算数**：顾问方案里的数字只能来自工具实跑；方案卡显示的是关 3 标准口径复算值。
5. **准备槽独立判定**：同将可同时准备多个战法，释放回合只跳过被释放的那个。
6. **被动按槽位顺序结算**：主战法槽先判定，装配战法按添加顺序（一趟循环，不可分两趟）。
7. **两类指挥语义**：一类（prep）准备阶段释放一次、施法者阵亡仍在；二类（round）看实时、施法者兵力 0 则失效。
8. **状态两组递减时点**：第 2 组（控制/属性/增减伤/连击/分兵）在携带者下次行动开始时递减；第 1 组（DoT/治愈）在行动结束后递减。
9. **文案的「前 N 回合」是判定窗口、不是状态时长**：窗口内每回合判定，每次命中只给 `duration: 1`。
10. **数据不编造**：战法/武将数值一律严格按 [dateyuan/](file:///workspace/dateyuan) 调研文档实现。
11. **版本号纪律**：`web/changelog.ts` 的 `ANNOUNCEMENTS` 是唯一真源，每次上线必须在最前面加一条。
12. **生成物随提交入库**，保证每个提交自洽。

---

## 14. 扩展指南：新增一名武将

按 [AGENTS.md § 工作树与提交](file:///workspace/AGENTS.md#L45) 的流程：

1. 在 [src/data/skills.ts](file:///workspace/src/data/skills.ts) 定义主战法 `Skill`。
2. 在 [scripts/build_heroes_seed.mjs](file:///workspace/scripts/build_heroes_seed.mjs) 的 `SKILL_ID_BY_NAME` 挂槽。
3. 新增 `tests/main_skills_bN.test.ts`（每战法 ≥3 测试）。
4. 受属性缩放（受谋略/攻击/速度）的段**成长率留空**，并登记 [src/data/listing.ts](file:///workspace/src/data/listing.ts) 的 `OFFLINE_MAIN_SKILLS`（武将暂下架，成长率补齐后再移出）。
5. 跑生成链更新 `web/data/*.json` 与 `seed_heroes.sql`。
6. `npm test` 全绿 → 提交 → `git push origin`。

---

## 15. 术语表

| 术语 | 含义 |
|------|------|
| 斩首制 | 一侧「大营」阵亡即判负（不再要求全灭） |
| 一类指挥 | `phase:'prep'`，准备阶段释放一次、按准备时兵力/属性结算 |
| 二类指挥 | `phase:'round'`，每回合行动时判定、看实时数据 |
| 伤兵池 | 受击损失除直接死亡外的部分，可被恢复消耗，每回合按率阵亡 |
| 木桩 / inert | `inertSides` 指定的不还手侧，供伤害期望测评当靶子 |
| 事件流 | `BattleEvent[]`，引擎唯一结构化输出 |
| box | 顾问的用户资产档案（五星武将/战法清单），可约束「给自己配将」范围 |
| 三阶段校验门 | 顾问方案的合法性 / 数值可溯 / 标准口径复算三重校验 |
| 分档路由 | 顾问按 base/search/write 三档裁剪工具面以省 token |
| golden 快照 | 锁定固定测试集输出的快照测试 |

---

<sub>本文档由代码逆向梳理生成，覆盖引擎 / 数据 / 前端 / AI 顾问 / 肉鸽 / 安卓壳 / 脚本 / 测试各层。更细的口径以 [AGENTS.md](file:///workspace/AGENTS.md) 与 [docs/](file:///workspace/docs) 为准。</sub>
