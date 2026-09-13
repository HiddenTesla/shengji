# 🃏 出牌（打牌）阶段实现计划

> 本文是 `PLAN.md` 中「出牌」部分的**独立展开**。按「可运行、可验证的最小步」拆分，
> 每一步都能单独跑通并确认，避免一次性写完无法定位问题。

---

## 一、总览

### 现状盘点

| 已有 | 说明 |
|------|------|
| `core/types.ts` | 已含 `HandType`(Single/Pair/Tractor/Throw)、`PlayedCards`、`Trick`、`RoundScore`、`GameConfig`（含抠底倍数） |
| `core/trump.ts` | `isTrump` / `getTrumpRank`（**已验证大小次序正确**）/ `canCardBeat`（部分可用） |
| `core/card.ts` | `groupCardsForDisplay`（**门**的定义）、`sortCards`、`sameRank` / `sameSuit` / `isTrumpCard` |
| `core/deck.ts` / `bidding.ts` / `bury.ts` / `rank.ts` | 发牌 / 叫主 / 埋底 / 升级判定 |
| `App.tsx` | `GamePhase.Playing` 已存在，但目前只显示手牌 |

**尚缺**：`hand.ts`、`trick.ts`、`scoring.ts`、`ai.ts`；无测试框架；无出牌 UI。

### 「门」的定义（贯穿全阶段）

- **主牌门** = 大小王 + 全部级牌（无论花色）+ 主花色；
- **副牌门** = 其余各花色各成一门；
- 即 `groupCardsForDisplay()` 的分组就是「门」。

### 目标数据结构

```ts
type DoorKind = Suit | 'trump'

interface TrickState {
  leadPlayer: PlayerPosition
  leadDoor: DoorKind          // 首出的门
  leadType: HandType          // 首出牌型
  leadCount: number           // 首出张数
  plays: PlayedCards[]        // 按出牌顺序
  winner: PlayerPosition | null
  points: number              // 本墩分数
}

interface PlayState {
  turn: PlayerPosition
  trick: TrickState
  tricks: Trick[]             // 已收的墩
  defendingPoints: number     // 闲家（进攻方）得分
  bankerPoints: number        // 庄家（防守方）逃分
  bottomPoints: number        // 底牌分（最后结算）
}
```

### 文件规划

| 文件 | 作用 | 引入步骤 |
|------|------|----------|
| `core/play.ts` | 出牌状态机（纯函数：开局/出牌/收墩/下一家） | 1 |
| `components/TrickArea.tsx` | 牌桌中央出牌区 | 1 |
| `core/hand.ts` | 牌型检测 + 合法出牌生成 | 4 |
| `core/trick.ts` | 墩大小比较 / 定胜负 | 5 |
| `core/scoring.ts` | 分牌统计 / 得分累计 / 抠底 | 6、7 |
| `core/ai.ts` | 托管出牌策略 | 1 起逐步增强 |
| `components/GameLog.tsx` | 日志面板 | 3 |
| `components/ScoreBoard.tsx` | 计分板 | 6 |
| `vitest` | 核心逻辑单测 | 1 |

---

## 二、分步 Breakdown

### 步骤 1 · 最基础跟牌（先跑通循环）

**范围（刻意放宽）**
- **领出**：只要求**同一门**内即可（主牌算一门），张数不限，不校验对子/拖拉机。
- **跟出**：只要求**张数与领出一致**，任意牌，不校验合法性与门。
- **不计分**。
- **永远是领出者赢**（完全不做大小判断）。
- 4 家轮流出牌；每墩出完收墩，**领出者继续领出**，直到 4 家手牌出完。

**实现**
- `core/play.ts`：`createPlayState()` / `playCards(state, player, cards)` / `collectTrick()` / `nextTurn()`。
- `TrickArea.tsx`：中央按东南西北方位显示本墩 4 手牌。
- 手牌交互：点选 N 张 →「出牌」；张数/门不合法时禁用按钮并提示原因。
- 托管玩家由 AI 自动出牌（简单策略：跟出该门最小的牌；领出最优门的最小牌）。

**验收**
- 4 家能连续出完所有手牌；出牌区轮转正确；托管自动出牌。
- 单测：墩轮转、收墩后领出者不变、手牌总数单调递减。

**决策点**：这一步不碰规则，只验证「状态机 + UI + AI 驱动」这条链路。

---

### 步骤 2 · Undo（撤销）

**范围**
- 撤销到「上一次**玩家决策**之前」：即回退玩家上一手牌，**及其后所有托管玩家的自动出牌**。
- 原因：AI 是确定性的，若只撤销一步 AI 会立刻原样重出，等于没撤销。

**实现**
- 每次出牌前压入快照 `{ hands, playState }`，快照带 `byHuman` 标记。
- `undo()`：弹栈直到越过最近一个 `byHuman` 快照。
- 撤销后短暂**暂停 AI 自动出牌**，等玩家下一次操作再恢复，避免"秒回"。

**验收**
- 任意时刻可撤销；撤销后手牌/当前墩/轮到谁都恢复正确；AI 不立即重出。

---

### 步骤 3 · 日志

**范围**
- 记录：叫主/反主、埋底、每次出牌（方位 + 牌 + 牌型）、每墩结果（赢家 + 墩分）、得分变化、升级提示。
- 可滚动，最新在底部。

**实现**
- `LogEntry { id, kind, text }`，由状态机在关键节点产生。
- `components/GameLog.tsx` 渲染（先放角落，后续再美化）。

**验收**：收一墩后日志出现 4 条出牌 + 1 条收墩记录。

---

### 步骤 4 · 跟牌合法性（最复杂，建议先写足单测）

**规则范围**
1. **牌型识别**：`Single` / `Pair` / `Tractor`（≥2 连续对子）/ `Throw`（甩牌组合）。
2. **有此门必跟此门**：手上有首出那一门，必须出该门。
3. **有对必对**：首出含 N 个对子时，跟者在该门内有对子必须优先出对（数量 ≤ N）。
4. **有拖必拖**：首出为拖拉机且跟者该门内有**同长度**拖拉机时必须出；不足时先出对子，再出单张。
5. **垫牌 / 毙牌**：该门无牌时可垫任意牌，或用主牌毙；**毙牌同样受「有对必对/有拖必拖」约束**。
6. **甩牌合法性**：领出多张组合时必须「其余三家都管不上」，`DEFAULT_GAME_CONFIG.allowThrow` 控制开关。

**实现（`core/hand.ts`）**
- `detectHandType(cards, trumpSuit, levelRank): HandType | null`
- `getLegalLeads(hand, trumpSuit, levelRank, allowThrow): Card[][]`
- `getLegalFollows(hand, lead, trumpSuit, levelRank): Card[][]`
- `getLegalPlays(...)`：统一入口；组合数可能爆炸 → **生成器 + 上限保护**。

**待定规则（需确认）**
- 打 5 时副花色的 `4 与 6` 是否算连续（`PLAN.md` 6.1 认为**算**，即级牌从该门抽走后序列"搭桥"）。
- 主牌拖拉机是否允许跨「大王对/小王对/级牌对/主花色对」。
- 甩牌的具体判定（全部管不上 / 仅最大者管不上）。

**验收（单测重点）**
- 有此门必跟 / 有对必对 / 有拖必拖 / 无此门可垫可毙 / 甩牌合法。
- 边界：级牌当主、无主局、拆对拆拖、张数不足。

---

### 步骤 5 · 大小判断

**范围**
- 同门同型比大小：单张比点数、对子比对子、拖拉机比最高对。
- **毙牌**：主牌 > 副牌；**盖毙**：更高主牌 > 更低主牌。
- **垫牌不能赢**；同大时**先出者赢**。
- 替换步骤 1 的「领出者恒赢」。

**实现（`core/trick.ts`）**
- `beats(candidate, best, ctx): boolean`
- `judgeTrick(trick, trumpSuit, levelRank): PlayerPosition`
- 复用 `trump.ts::getTrumpRank`（已验证次序正确）；现有的 `canCardBeat` 视情况重构或弃用。

**验收**：单墩用例表 —— 跟大/跟小、毙/盖毙、垫牌、对子不能压单张、拖拉机压制。

---

### 步骤 6 · 计分（闲家得分 / 庄家逃分）

**范围**
- 每张 **5 = 5 分**，**10 / K = 10 分**（`pointValue` 已实现）。
- 收墩时把该墩分数记给**赢家所在队**。
- 分别累计并显示：
  - **闲家得分**（进攻方 = 非庄家队）赢得的墩分
  - **庄家逃分**（庄家队）赢得的墩分
- 底牌分此步**不参与**（留到步骤 7）。
- 提示：本局在打的总分 = 闲家墩分 + 庄家墩分；底牌分单独结算。

**实现**
- `core/scoring.ts`：`trickPoints(cards)`、`accumulate(state, winner, cards)`。
- `components/ScoreBoard.tsx`：两队分数 + 80 分进度。

**验收**
- 单测：5/10/K 计分正确；**分数守恒**（闲家墩分 + 庄家墩分 = 在打牌张的总分）。
- 界面实时刷新。

---

### 步骤 7 · 底牌计分（抠底）

**范围**
- 最后一墩若**闲家赢** → **抠底**：`闲家得分 += 底牌分 × 倍数`。
- 倍数按**最后一墩牌型**：单张 ×2、对子 ×4、拖拉机 ×8，每多一对再 ×2（沿用 `DEFAULT_GAME_CONFIG` 的 4 个倍数字段）。
- 未抠底 → 底牌分不计。
- 展示：翻开底牌 + 倍数 + 抠底结果。

**实现**
- `core/scoring.ts`：`bottomMultiplier(handType, pairCount)`、`settleBottom(...)`。
- 复用 `BottomReveal` 的弹窗样式展示底牌。

**验收**：单测单/对/拖各倍数、未抠底、总分结算。

---

### 步骤 8（收尾）· 升级 / 上台 / 开下一局

- 用 `rank.ts` 的 `RankManager` + `calculateUpgrade` 结算升级级数与庄家。
- ⚠️ 现有 `calculateUpgrade` 的 `isDefenderBanker` 分支逻辑较绕，**接入前先按选定规则校对/重写**。
- 结算面板 → 下一局：新级牌、新庄家、重新发牌。

---

## 三、横切关注点

**回合驱动**
- 托管玩家：`useEffect` 监听 `turn`，延迟 ~700ms 自动出牌；手动玩家等待交互。
- 手动模式可随时按方位切换（已有 `PlayerMode` 机制）。

**UI 布局**
- 中央区域改为**出牌区**（东南西北四手牌），此前已刻意为它腾出空间。
- 底部沿用现有手牌点选交互；Undo / 日志 / 计分板布置在中央面板或角落。

**测试（强烈建议）**
- 引入 `vitest`，对 `hand.ts` / `trick.ts` / `scoring.ts` 做单测。
- 这几处规则分支最多、最容易出错；先有测试再调 UI 提示。

---

## 四、建议执行顺序

```
步骤 1（循环） → 2（Undo） → 3（日志）
        → 4（合法性，配足单测） → 5（大小）
        → 6（计分） → 7（抠底） → 8（升级/下一局）
```

- 3 可与 1/2 并行做。
- 4、5 是核心且互相依赖（牌型定义一致），建议同一位开发者连续完成。
- 每步结束时：`tsc` 通过 + 单测全绿 + 浏览器可演示。
