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

### 步骤 1 · 最基础跟牌（先跑通循环）✅

> **已完成**：`core/play.ts`（状态机 + 校验 + 最简 AI）、`components/TrickArea.tsx`（出牌区）、
> `components/PlayBar.tsx`（出牌控制栏），并接入 `App.tsx`：托管自动出牌、领出同门校验、
> 跟出张数校验、四家出满后收墩由赢家继续领出、手牌出完进入 `RoundEnd`。
> 实测：全托管可连续打完 **25 墩** 并正确结束。

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

### 步骤 2 · Undo（撤销）✅

> **已完成**：撤销栈 `UndoSnapshot{ kind: 'bury'|'play', hands, playState, phase, buriedCards, bottom }`，
> **埋底确认**与**玩家出牌**前各压一栈（托管动作不压栈）；`undo()` 弹栈恢复（含 `bottomRef`）。
> 按钮在「新的一局」旁，显示可撤销步数，提示会说明撤销的是「埋底」还是「出牌」。
>
> 实测：
> - **撤销出牌**：手牌 24→25、墩数 2→1、轮次回到原玩家；等 3 秒状态稳定（托管不会「秒回」）；连续撤销逐级回退正确。
> - **撤销埋底**：手牌 25→33、回到「庄家（X家）埋底」界面、底牌还原，可重新埋底。
> - **混合链**：埋底 → 出牌 → 连续撤销两次，依次回到「出牌前」→「埋底前」。

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

### 步骤 3 · 日志（⏸ 后置：按 binlog 式设计）

> **后置**：不做"显示用"日志，而是按 **binlog 式**（结构化 / 可复盘 / 机器可读）统一设计，放在出牌规则（步骤 4~7）之后。
>
> 设计要点：
> - **事件溯源（event-sourced）**：每次状态变更产出一条 `Event`（`deal` / `bid` / `bury` / `play` / `collect` / `undo` / `score` …），`Event[]` 即 binlog。
>   回放 = 初始状态 + `fold(events)`。
> - 事件携带足够信息（方位、牌、牌型、墩号、得分…），带自增序号与时间戳。
> - 必须记录**发牌随机性**（shuffle seed 或完整发牌结果），否则无法真正复现。
> - **撤销也要作为事件**写入（`undo`），保证"事件流 → 状态"始终一致。
> - 副产品：牌局导入/导出（`PLAN.md` #29）、回放器、断点续玩都直接复用。

**范围**
- 记录：叫主/反主、埋底、每次出牌（方位 + 牌 + 牌型）、每墩结果（赢家 + 墩分）、得分变化、升级提示。
- 可滚动，最新在底部。

**实现**
- `LogEntry { id, kind, text }`，由状态机在关键节点产生。
- `components/GameLog.tsx` 渲染（先放角落，后续再美化）。

**验收**：收一墩后日志出现 4 条出牌 + 1 条收墩记录。

---

### 步骤 4 · 跟牌合法性 ✅

> **已完成**：新增 `core/hand.ts`（门 / 门内次序 / 牌型检测 / 领出与跟牌校验 / 托管选牌）。
> `play.ts` 的 `validatePlay` 改为委托 `hand.ts`，`TrickState` 增加 `leadPairs` / `leadTractor`。
> 托管与人工出牌共用同一套规则，托管出牌带**合法性自检告警**（`[AI] 非法出牌`）。
>
> 实测：**25 条规则用例全过**；全托管跑通整轮无告警；UI 提示正确（如「手上还有♥，必须跟♥」且出牌按钮禁用）。

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

**已定规则（默认取值，详见 `hand.ts` 末尾「规则取舍」）**
- 级牌抽走后**搭桥**：打 5 时 ♠4 与 ♠6 视为连续 → **算**拖拉机。（已实现）
- 主牌拖拉机**允许跨档**：主花色非级牌 → 副级牌 → 主级牌 → 小王 → 大王，相邻槽位成对即算；
  不同花色的副级牌共享同一槽位 → **不算**。
- 甩牌：已识别为 `Throw`，但「无人能管」的校验依赖大小判断（步骤 5）→ **暂未启用**。
- 毙牌：补牌全为主牌时，套用主牌门的「有对必对 / 有拖必拖」。

**验收（单测重点）**
- 有此门必跟 / 有对必对 / 有拖必拖 / 无此门可垫可毙 / 甩牌合法。
- 边界：级牌当主、无主局、拆对拆拖、张数不足。

---

### 步骤 5 · 大小判断 ✅

> **已完成**：新增 `core/trick.ts`；`play.ts::judgeTrick(trick, trumpSuit, levelRank)` 改为委托 `judgePlays`。
> 实测：**20 条比较用例全过**；全托管整轮 25 墩，赢家出现**东南西北四家**（不再是恒为领出者），无非法出牌告警。

**范围**
- 同门同型比大小：单张比点数、对子比对子、拖拉机比最高对。
- **毙牌**：主牌 > 副牌；**盖毙**：更高主牌 > 更低主牌。
- **垫牌不能赢**；同大时**先出者赢**。
- 替换步骤 1 的「领出者恒赢」。

**实现（`core/trick.ts`）**
- `tierOf`：层级 2 = 主牌毙（首出非主）、1 = 首出门、0 = 垫牌（不能赢）
- `beats(candidate, best, lead, …)`：先比层级；同层内需 `canCompete`（同型同长度）后再比「门内最大槽位」
- `judgePlays(plays, lead, …)`：按出牌顺序取最大，同大时**先出者赢**
- 复用 `hand.ts::slotOf` / `analyzeShape`；旧 `trump.ts::canCardBeat` 未再使用
- 甩牌：暂按「张数相同」比较（甩牌合法性仍未启用）

**验收**：✅ 20 条用例全过——跟大/跟小、毙/盖毙、垫牌不能赢、对子不能压单张、拖拉机压制、同大先出者赢。

---

### 步骤 6 · 计分（闲家得分 / 庄家逃分）✅

> **已完成**：新增 `core/scoring.ts`、`components/ScoreBoard.tsx`。
> 实测：种子 1/7/42 整轮模拟均 `finished:true, illegal:0, tricks:25, remain:0`，
> 且**分数守恒** `闲家 + 庄家 = 200 − 底牌分`；界面实测从 0 实时递增到 200，
> 终局 **闲家 105 / 庄家 95 / 合计 200**（与「本局结束 · 共 25 墩」同时出现）。

**范围**
- 每张 **5 = 5 分**，**10 / K = 10 分**（`pointValue` 已实现）。
- 收墩时把该墩分数记给**赢家所在队**。
- 分别累计并显示：
  - **闲家得分**（进攻方 = 非庄家队）赢得的墩分
  - **庄家逃分**（庄家队）赢得的墩分
- 底牌分此步**不参与**（留到步骤 7）。
- 提示：本局在打的总分 = 闲家墩分 + 庄家墩分；底牌分单独结算。

**实现**
- `core/scoring.ts`：`trickPoints(cards)`（5=5、10/K=10）、`isDefender(pos, banker)`、
  `accumulate(prev, winner, cards, banker)`。
- `core/play.ts`：`PlayState` 增 `banker` / `defendingPoints`（闲家得分）/ `bankerPoints`（庄家逃分）；
  `createPlayState(banker)`；`collectTrick` 收墩时按赢家所在队累计。
- `components/ScoreBoard.tsx`：闲家得分（≥80 进度条转红）+ 庄家逃分 + 合计，渲染在 `TrickArea` 上方。
- `components/TrickArea.tsx`：墩心显示 `本墩 X 分`。

**验收**✅
- 分数守恒：`闲家墩分 + 庄家墩分 = 200 − 底牌分`（3 种子整轮模拟，0 非法出牌）。
- 界面随每次收墩**实时刷新**，结束时数值与引擎一致。

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
步骤 1（循环）✅ → 2（Undo）✅
        → 4（合法性，配足单测） → 5（大小）
        → 6（计分） → 7（抠底） → 8（升级/下一局）
        → 3（binlog 式日志：事件层可提前随 4/5 一并铺垫）
```

- 步骤 3（日志）**后置**，但建议在做 4/5 时就把"事件层"建起来（便宜且不用回头改）。
- 4、5 是核心且互相依赖（共享"牌型检测"），建议连续完成。
- 每步结束时：`tsc` 通过 + 单测全绿 + 浏览器可演示。
