# 🃏 出牌（打牌）阶段实现计划

> 本文是 `PLAN.md` 中「出牌」部分的**独立展开**。按「可运行、可验证的最小步」拆分，
> 每一步都能单独跑通并确认，避免一次性写完无法定位问题。

---

## 进度总览（截至本 session 结束）

| 步骤 | 状态 | 说明 |
|------|------|------|
| 1 · 出牌循环 | ✅ 完成 | 状态机 + `TrickArea` + `PlayBar`，全托管可跑完 25 墩 |
| 2 · Undo | ✅ 完成 | 埋底 / 出牌均可撤销，逐级回退，托管不会「秒回」 |
| 3 · binlog 式日志 | ⏸ 后置 | 设计已定（事件溯源），**尚未实现** |
| 4 · 跟牌合法性 | ✅ 完成 | 含**甩牌合法性 + 自动出小 + 失败折叠框**（详见步骤 4） |
| 5 · 大小判断 | ✅ 完成 | `trick.ts`；20 条用例 + 整轮模拟通过 |
| 6 · 计分 | ✅ 完成 | `scoring.ts` + `ScoreBoard`，分数守恒已验证 |
| 7 · 底牌计分（抠底） | ✅ 完成 | `scoring.ts` 抠底函数 + `play.ts` 末墩结算 + `RoundSettlement` 面板 |
| 8 · 升级 / 上台 / 开下一局 | ✅ 完成 | 两队各自记级 + 升级规则 + `RoundSettlement` 展示与「下一局」按钮 |

**未纳入步骤、但已知待办**
- `DEFAULT_GAME_CONFIG.allowThrow` 至今**未被任何代码引用**（第 4 步的甩牌规则已改用 `throwFallback` 实现开关语义可后续补）。
- **未安装测试框架**（`vitest`）——目前靠浏览器内直接调 core 模块做断言；仍是最建议补的基建。
- `PLAN.md` 里设想的 `core/ai.ts` 未单独建文件：托管 AI 现在 `hand.ts`（`chooseLead`/`chooseFollow`）+ `play.ts`（`aiChoosePlay`）。
- 步骤 4~7 **未**按事件溯源实现（见步骤 3），将来接日志时需要回填事件。

---

## 一、总览

### 现状盘点

| 已有 | 说明 |
|------|------|
| `core/types.ts` | 已含 `HandType`(Single/Pair/Tractor/Throw)、`PlayedCards`、`Trick`、`RoundScore`、`GameConfig`（含抠底倍数） |
| `core/trump.ts` | `isTrump` / `getTrumpRank`（**已验证大小次序正确**）/ `canCardBeat`（部分可用） |
| `core/card.ts` | `groupCardsForDisplay`（**门**的定义）、`sortCards`、`sameRank` / `sameSuit` / `isTrumpCard` |
| `core/deck.ts` / `bidding.ts` / `bury.ts` / `rank.ts` | 发牌 / 叫主 / 埋底 / 升级判定（✅ 已按「闲家得分」重写） |
| `core/hand.ts` | ✅ 门 / 门内次序 / 牌型 / 校验 / 托管选牌 / `throwFallback`（步骤 4） |
| `core/trick.ts` | ✅ 墩大小比较 / 定胜负（步骤 5） |
| `core/scoring.ts` | ✅ 墩分统计与累计（步骤 6）+ 抠底倍数与结算（步骤 7） |
| `core/play.ts` | ✅ 出牌状态机（含 `resolveLead` 自动出小） |
| `App.tsx` | ✅ 出牌阶段已完整接入（出牌区 / 控制栏 / 计分板 / 撤销 / 托管驱动） |

**尚缺**：binlog 日志（步骤 3）、测试框架。
（`core/ai.ts` / `components/GameLog.tsx` 均未建立。）

### 「门」的定义（贯穿全阶段）

- **主牌门** = 大小王 + 全部级牌（无论花色）+ 主花色；
- **副牌门** = 其余各花色各成一门；
- 即 `groupCardsForDisplay()` 的分组就是「门」。

### 目标数据结构（已实现后的真实形状）

```ts
interface TrickState {
  leadPlayer: PlayerPosition
  leadDoor: DoorKind | null   // 首出的门
  leadCount: number           // 首出张数
  leadType: HandType          // 首出牌型
  leadPairs: number           // 首出对子数
  leadTractor: number         // 首出拖拉机长度（对数）
  plays: PlayedCards[]        // 按出牌顺序
  complete: boolean           // 四家已出完、等待收墩
  winner: PlayerPosition | null
  throwBlocked: boolean       // 甩牌被拦（出牌后判定）
  throwAttempt: Card[]        // 原本想甩的牌（本墩展示用）
}

interface PlayState {
  banker: PlayerPosition      // 区分闲家 / 庄家队
  turn: PlayerPosition
  trick: TrickState
  tricks: Trick[]             // 已收的墩（`Trick.points` 在收墩时算）
  defendingPoints: number     // 闲家（进攻方）得分
  bankerPoints: number        // 庄家（防守方）逃分
}
```

> `bottomPoints`（底牌分）尚未实现，属步骤 7。

### 文件规划

| 文件 | 作用 | 引入步骤 | 状态 |
|------|------|----------|------|
| `core/play.ts` | 出牌状态机（纯函数：开局/出牌/收墩/下一家） | 1 | ✅ |
| `components/TrickArea.tsx` | 牌桌中央出牌区 | 1 | ✅ |
| `components/PlayBar.tsx` | 出牌控制栏 | 1 | ✅ |
| `core/hand.ts` | 牌型检测 + 合法出牌校验 + 托管选牌 + 甩牌「自动出小」 | 4 | ✅ |
| `core/trick.ts` | 墩大小比较 / 定胜负 | 5 | ✅ |
| `core/scoring.ts` | 分牌统计 / 得分累计 / 抠底 | 6、7 | ✅ |
| `components/ScoreBoard.tsx` | 计分板 | 6 | ✅ |
| `components/RoundSettlement.tsx` | 本局结算面板（得分 + 底牌 + 抠底明细） | 7 | ✅ |
| `core/ai.ts` | 托管出牌策略 | 1 起 | ⬜ 未建（并入 hand/play） |
| `components/GameLog.tsx` | 日志面板 | 3 | ⬜ 未建 |
| `vitest` | 核心逻辑单测 | 1 | ⬜ 未安装 |

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
6. **甩牌合法性**（✅ 已实现，见下）：领出多张组合（`Throw`）时其余三家必须「要不上」，
   否则**自动出小**；判定在**出牌之后**，且只告知出牌者「被拦」。

**实现（`core/hand.ts` / `core/play.ts`）**
- `analyzeShape(cards, trumpSuit, levelRank): HandShape` → `{type, door, count, pairs, tractor}`
- `validateLead(cards, trumpSuit, levelRank)`：出牌前**只**校验同一门
- `throwFallback(cards, opponents, trumpSuit, levelRank)`：甩牌被拦 → 自动出小的那一组
- `validateFollow(hand, lead, cards, trumpSuit, levelRank)`：有此门必跟 / 有对必对 / 有拖必拖
- `chooseLead` / `chooseFollow`：托管 AI 直接构造合法出牌（不穷举组合）
- `applyPlay` 领出时调 `resolveLead`：未被拦按原牌出，被拦则改出 `throwFallback` 的组
  （其余牌留在手上），并记入 `TrickState.throwBlocked`

**已定规则（默认取值，详见 `hand.ts` 末尾「规则取舍」）**
- 级牌抽走后**搭桥**：打 5 时 ♠4 与 ♠6 视为连续 → **算**拖拉机。（已实现）
- 主牌拖拉机**允许跨档**：主花色非级牌 → 副级牌 → 主级牌 → 小王 → 大王，相邻槽位成对即算；
  不同花色的副级牌共享同一槽位 → **不算**。
- 甩牌（✅ 已实现）：**出牌之后**按「组」判定（`throwFallback`，由 `applyPlay` 调用）——
  1. 含**单张** → 该门内其余三家没有比**最小单张**大的牌；
  2. 含**独立对子**（不属于拖拉机的对子）→ 没有比**最小对子**大的对子（含对方拖拉机里的对子）；
  3. 含**拖拉机** → 没有比**最小拖拉机**大的拖拉机（**长度优先**：8899 > 4455；445566 > 8899）。
  **不考虑毙牌**：只要该门内要不上即可甩。纯 `Single` / `Pair` / `Tractor` 领出**不受**此检查
  （只有 `Throw` 才是甩牌，如 4455 可随便领出）。
  **不检查自己剩下的牌**：手上可以留着比甩出牌更大的牌。
  **被拦 → 自动出小**：按 **单张 → 对子 → 拖拉机** 的顺序，取第一个有被拦组的类型里
  **最小**的那个被拦组来出，其余牌留在手上。例（级牌 2）：甩 678 而对手有 7 → 出 6；
  甩 AKJJ 而对手有 QQ → 出 JJ；甩 AKQQ8899 而对手有 1010JJ → 出 8899（拖）。
  **信息隔离**：出牌前不判定（否则泄露其余三家手牌）；被拦时只提示「甩牌被拦了，已自动出小」，
  不透露是谁、哪些牌被拦、对方持有什么牌。
  **失败展示**：`TrickState.throwAttempt` 记下原本想甩的牌；实际出牌旁显示
  「✗ 甩牌失败 · 欲甩 N 张 ▸」按钮，点击展开**折叠框**（默认收起）用出牌区同尺寸看这手牌；
  绝对定位，不影响布局；本墩收走后自动消失。
- 毙牌：补牌全为主牌时，套用主牌门的「有对必对 / 有拖必拖」。

**验收（单测重点）**
- 有此门必跟 / 有对必对 / 有拖必拖 / 无此门可垫可毙 / 甩牌合法。
- 甩牌用例（实测）：`AKQ` 被对方 `K` 挡下；`AA99` 被 `JJ`（含 `JJTT` 里的对子）挡下；
  `AA+4455` 被 `8899` 挡下，而 `AA+445566` 可甩；单张 `J` 不挡 `AAQ`。
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
- 甩牌：按「张数相同 + 最大牌」比较；被拦时已在出牌前「自动出小」改出（`applyPlay` → `throwFallback`）

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

### 步骤 7 · 底牌计分（抠底）✅

> **已完成**。新增 `scoring.ts::bottomTractorLength` / `bottomMultiplier` / `settleBottom`；
> `play.ts::collectTrick` 在**最后一墩**收墩时结算（签名增加 `bottomCards`/`trumpSuit`/`levelRank`），
> `PlayState` 增 `bottom: BottomSettlement | null`；新增 `components/RoundSettlement.tsx` 面板。
>
> 实测：4 条用户用例（单张 / 单对 / 不相连两对 / 拖2+单对）倍数全对；
> 「领出 vs 大出」用例（领出 KQ、闲家一对大王毙牌）仍按**领出**的单张算 ×2；
> 未抠底（含庄家对家大出）一律 **×0 / +0 分**；
> 12 轮整轮模拟（人为制造非零底分）`墩分守恒 OK`、`非法=0`、`墩=25`，
> 闲家赢末墩时 `闲家得分 += 底牌分 × 倍数`，未抠底时底分不计。

**规则（用户确认）**
- **末墩由闲家方赢** → 抠底计分；否则 **0 倍、不得分**（`multiplier = 0`、`points = 0`）。
  - 「闲家赢」按**队伍**判定（`isDefender` / `teamOf`）：庄家与其**对家同队**，
    庄家对家大出即视为**庄家方大出** → 同样 0 倍。
  - **领出者是谁不影响是否抠底**（庄家方 / 闲家皆可），只影响倍数里的牌型。
- 倍数 `= 2^(n+1)`，其中 **n = 末墩「拖拉机长度」**，按**末墩领出者所出的牌**计算：
  - ⚠️ **以领出者为准，不是最终大出的那家**。例：领出甩 `♠K♠Q`，另一家以**一对大王**毙牌大出
    → 仍只按单张算 ×2（而非按赢家的对子算 ×4）。
  - 无对子 → n = 0 → ×2
  - 1 个对子 → n = 1 → ×4（**对子视为长度 1 的拖拉机**）
  - 有对子但不相连（如 `99QQ`）→ 各段长度均为 1 → n = 1 → ×4
  - 长度 2 的拖拉机（如 `8899`）→ n = 2 → ×8（即使同时还夹着别的单对，仍取**最长段**）
- 分牌：5 = 5 分，10 / K = 10 分（沿用 `trickPoints`）。

**实现**
- `hand.ts`：新增导出 `maxPairRunLength`（门内最长连续对子段，单对记 1、无对记 0）；`maxTractorLength` 改为复用它。
- `scoring.ts`：`bottomTractorLength(cards, trumpSuit, levelRank)`（按门分别算后取最大，兼容甩牌被拦后换牌）、
  `bottomMultiplier(n) = 2^(n+1)`、`settleBottom(lastTrick, bottomCards, banker, trumpSuit, levelRank)` → `BottomSettlement`。
  `settleBottom` 取 **`lastTrick.leadPlayer` 的那一手**（而非 `winner`）算牌型。
- `play.ts`：`collectTrick(...)` 在 `roundOver` 时结算，抠底分计入 `defendingPoints`；`PlayState.bottom` 供 UI 展示。
- `components/RoundSettlement.tsx`：展示墩数 / 闲家得分（含抠底）/ 庄家逃分 / 合计，翻开底牌 + 底分 + n + 倍数 + 抠底结果。

**验收**：✅ 单/对/不相连两对/拖2 各倍数、**未抠底 ×0**、**庄家对家大出 ×0**、单张末墩、
领出者≠赢家（以领出为准）、领出者敌我无关、整轮结算全部通过。

> ⚠️ 注意：抠底后 `闲家得分 + 庄家逃分` 会**大于 200**（抠底分 = 底牌分 × 倍数，可超过底牌面值）。
> 不含抠底的墩分守恒仍为 `闲家墩分 + 庄家墩分 = 200 − 底牌分`。步骤 8 的升级判定用**含抠底**的 `defendingPoints`。

---

### 步骤 8（收尾）· 升级 / 上台 / 开下一局 ✅

> **已完成**（规则 + 展示 + 下一局接线）。
>
> `rank.ts` 删除旧的 `calculateUpgrade`/`simpleUpgrade`（`isDefenderBanker` 分支太绕），
> 改为**纯函数**：`calculateLevelChange(闲家得分)` → `{ side, switchBanker, steps }`，
> `advanceLevel(级牌, 级数)` → `{ level, actualSteps, gameWon }`，
> `settleLevel(闲家得分, 庄家, 两级牌)` → `LevelSettlement`（含升级方、旧/新级牌、下一局庄家）。
>
> **两队各自记级（标准双升）**：`LevelBoard = Record<Team, Rank>`，`initialLevelBoard()` 两队都从 2 起；
> 本局打的级牌 = **庄家队的级牌**（`App.tsx`：`levelRank = levels[teamOf(banker)]`），**两队等级可不同**。
>
> **规则（按闲家得分）**：
> | 闲家得分 | 结果 |
> |---|---|
> | 0 | 庄家连庄，升 3 级 |
> | 5 – 35 | 庄家连庄，升 2 级 |
> | 40 – 75 | 庄家连庄，升 1 级 |
> | 80 – 115 | **换庄**，不升级 |
> | 120 – 155 | **换庄**，闲家升 1 级 |
> | ≥ 160 | **换庄**，闲家每多 40 分再升 1 级（`floor((得分−80)/40)`，上不封顶）|
>
> **下一局庄家**：
>   - **连庄**（庄家方获胜）→ 换到原庄的**对家**（`partnerOf`，同队两人轮流坐庄）
>   - **换庄**（闲家上台）→ 原庄的**下家**（`nextPlayer`；座位东南西北与队伍交替，故必为上台方）
> 级牌封顶 A，升过 A 即 `gameWon`（通关）。
>
> **下一局接线（`App.tsx`）**：
> - 发牌重构为 `dealRound(presetBanker)`；`startNewGame()` = 等级回 2 + `dealRound(null)`。
> - `startNextRound()`：`setLevels(升级方 → toLevel)` + `dealRound(levelSettlement.nextBanker)`。
> - **有预定庄家时，叫主只定主花色、不改庄家**：`applyDeclare` 仅在 `bankerRef.current === null` 时设庄，
>   `finishBidding` / 翻底定主都走 `bankerRef.current ?? 原逻辑`。
> - 展示：`components/RoundSettlement.tsx` 增「📈 升级判定」区（庄家连庄/闲家上台、升几级→新级牌、
>   **升级后级牌**、下一局庄家）与「▶ 下一局」按钮（通关后变「🔄 重新开始」）。
>
> **验收✅**
> - 单测：15 条分档用例 + 换庄/升级方/下一局庄家/通关/`advanceLevel` 边界全过；
>   多局推进脚本（东西 2→5、南北 2→3、东西 5→8 …）验证「两队等级不同」正确。
> - 浏览器实测：整局全托管跑完 → 结算面板 →「下一局」→ 新局头显示 **打 3**（新庄家队等级）、
>   庄家按规则预设且叫主只改主花色（翻底定主）；再跑多局：东→（换庄）北、（北）连庄→南、（南）连庄→北。

---

## 三、横切关注点

**回合驱动**
- 托管玩家：`useEffect` 监听 `turn`，延迟 ~700ms 自动出牌；手动玩家等待交互。
- 手动模式可随时按方位切换（已有 `PlayerMode` 机制）。

**UI 布局**
- 中央区域改为**出牌区**（东南西北四手牌），此前已刻意为它腾出空间。
- 底部沿用现有手牌点选交互；Undo / 日志 / 计分板布置在中央面板或角落。

**测试（强烈建议，⬜ 尚未做）**
- 引入 `vitest`，对 `hand.ts` / `trick.ts` / `scoring.ts` 做单测。
- 这几处规则分支最多、最容易出错；先有测试再调 UI 提示。
- 目前只能靠在浏览器里 `import('/src/core/xxx.ts?v=...')` 直接调 core 做断言（见仓库记忆）。

---

## 四、建议执行顺序

```
步骤 1（循环）✅ → 2（Undo）✅
        → 4（合法性）✅ → 5（大小）✅
        → 6（计分）✅ → 7（抠底）✅ → 8（升级/上台/下一局）✅
        → 3（binlog 日志）⏸ ← 下一步（可选）
```

**给下一个 session 的接续提示**
- **步骤 1~8 已全部完成**（出牌 → 抠底 → 升级 → 下一局可连续玩）。剩下的是可选项：
  binlog 日志（步骤 3，后置）、`vitest` 单元测试（横切）。
- 若继续做「下一局」相关：通关（`gameWon`）时目前只在结算面板显示 🏆 +「重新开始」按钮，
  **没有**进入 `GamePhase.GameEnd`；如需专门的通关界面可补。
- 叫主流程现在只负责**主花色**（有预定庄家时）；首局/新游戏庄家仍由叫主（亮主者）决定。
- 规则细节与踩过的坑都记在仓库记忆 `/memories/repo/notes.md`（含「门」/牌型分解、甩牌「自动出小」、DOM 自动化验证技巧）。
- 新增/修改后务必 `sed -i 's/\r$//'` 统一 LF，再 `npx tsc -b` 自检。
- 步骤 3（日志）仍**后置**：步骤 4~7 是在**没有事件层**的情况下完成的，将来补 binlog 时需要回填事件；
  也就是说 4~7 目前的验收只覆盖「状态」，不覆盖「事件流」。
- 4、5 是核心且互相依赖（共享"牌型检测"），建议连续完成。
- 每步结束时：`tsc` 通过 + 单测全绿 + 浏览器可演示。
