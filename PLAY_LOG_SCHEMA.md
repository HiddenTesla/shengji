# 出牌记录 Schema（Play Log v1）

> 设计稿 · 2026-10 · **尚未实现**（对应 `PLAY_PLAN.md` 步骤 3「牌局日志」）
> 相关实现：`src/core/play.ts`、`src/core/scoring.ts`、`src/core/rank.ts`、`src/App.tsx`

---

## 0. 结论先行

| 项目 | 结论 |
|------|------|
| 落盘格式 | **严格 JSON**（`JSON.stringify` 输出；UTF-8、无注释、无尾逗号）；整场游戏一个 `.json` 文件 |
| 读取格式 | **兼容 JSONC**：允许 `//`、`/* */` 注释与尾逗号（严格 JSON 天然兼容） |
| 文档示例 | `jsonc` 代码块（允许注释、尾逗号与 `"..."` 占位）；仅作说明，不是可直接落盘的文件 |
| 粒度 | `PlayLog` = 一场游戏 → `rounds[]` = 每局 → `tricks[]` = 每墩 → `plays[]` = 每手 |
| 生命周期 | **每局一份**：下一局发牌时重建（上一局清空）；结算页保留本局供查看 / 导出 |
| 顺序 | **只靠数组顺序**：没有再包一层 `events`，也没有 `seq` / `type` / `at` / `by` |
| 内容 | 发牌快照、亮主（**发到第几张**）、埋底、每墩四手、墩结果、抠底、升级结算 |
| 精简 | `shape` 只写非默认字段：单张就是 `{ "type": "single" }`；`count` / `tractor` 可推导，不写 |
| 撤销 | **不留痕**：从记录尾部截断，日志中看不到撤销痕迹 |
| 卡牌 | 稳定 ID 字符串：`"<suit><rank>#<copy>"`，如 `S5#0`、`H10#1`、`J17#0` |

---

## 1. 设计目标与非目标

**目标**

1. **可复盘**：只靠记录就能逐墩重算（发牌 → 埋底 → 出牌 → 收墩 → 抠底 → 升级）。
2. **可校验**：牌数、手牌数、得分守恒都能写成断言。
3. **可展示**：牌型、门、墩分、赢家都已写进记录，UI 不必重新实现规则。
4. **结构扁平**：每墩一个对象，直接 `map` 就能渲染；不需要事件归约。
5. **只保留有效历史**：撤销时从尾部截断，记录始终等于当前真实牌局。
6. **跨版本可读**：`schemaVersion` + 「未知字段忽略」；破坏性变更才升版本。

**非目标**

- **不记录时间戳**（不需要耗时统计；顺序由数组表达）。
- **不记录操作者**（手动 / 托管；只记录本局起始的 `playerModes`）。
- **不记录撤销**（无痕）。
- **不记录 AI 建议 / 思考过程**。
- 不记录 UI 状态（选中了哪些牌、面板是否展开）。
- 展示层仍需遵守信息策略：甩牌被拦不暴露拦牌者与拦牌。

---

## 2. 基础取值约定

| 概念 | JSON 取值 | 说明 |
|------|-----------|------|
| `position` | `"E" \| "N" \| "W" \| "S"` | 东 / 北 / 西 / 南 |
| `team` | `"NS" \| "EW"` | 南北 / 东西 |
| `suit` | `"S" \| "H" \| "C" \| "D"` | 黑桃 / 红心 / 梅花 / 方块；`null` 表示**无主** |
| `door`（门） | `"trump" \| "S" \| "H" \| "C" \| "D"` | 主牌门（王 + 所有级牌 + 主花色）或某个副花色 |
| `rank` | `2..14, 16, 17` | 11=J、12=Q、13=K、14=A、16=小王、17=大王（与 `Rank` 枚举一致） |
| `handType` | `"single" \| "pair" \| "tractor" \| "throw"` | 注意：裸的 `4455` / `445566` 算 `tractor`，不算 `throw` |
| `mode` | `"manual" \| "auto"` | 手动 / 托管 |
| `cardId` | 字符串 | `"<suit><rank>#<copy>"`；`copy ∈ {0,1}` 区分两副牌；**一局内 108 张唯一** |

**卡牌 ID 说明**

- 例：`S5#0` = 第一副的黑桃 5；`H10#1` = 第二副的红桃 10；`J16#0` / `J17#1` = 小王 / 大王。
- 现有运行时 `Card.id` 是 `"S-5-12"`（进程内自增），**不能直接当稳定 ID**。
  导出时按「本轮 108 张牌中同 `(suit, rank)` 的出现次序」重编为 `#0` / `#1`，保证可复现。
- 卡面值不需要额外的牌字典：ID 本身可解析，展示时用 `SUIT_SYMBOL` + `RANK_NAME`。

### 2.1 文本格式：写严格 JSON，读兼容 JSONC

| 场景 | 规则 |
|------|------|
| 落盘 / 导出 | 严格 JSON：只用 `JSON.stringify`，不输出注释与尾逗号 |
| 读取 / 导入 | 按 JSONC 解析：允许注释与尾逗号；严格 JSON 是 JSONC 的子集，天然可读 |
| 文档示例 | `jsonc` 代码块：允许注释、尾逗号、`"..."` 占位（仅用于说明） |

- **JSONC 只放宽两件事**：注释 + 尾逗号。不支持单引号、无引号 key、十六进制、`Infinity/NaN`、多行字符串（那些属于 JSON5）。
- 解析推荐用 `jsonc-parser`（VS Code 同款，浏览器可用）：
  `parse(text, errors, { allowTrailingComma: true, disallowComments: false })`。
  不要用正则剥注释——会把字符串里的 `//` 一起删掉。
- 解析失败要报「行:列 + 原因」，不要静默回退成空记录。
- 写入时不要手工拼 JSON 文本；`JSON.stringify(log)` 一定产出严格 JSON，尾逗号只可能出现在手改过的文件里。

---

## 3. 文档结构

```
PlayLog
├─ schemaVersion : 1
├─ gameId        : "G-20261021-01"
├─ appVersion?   : "0.1.0"
├─ rules         : { allowSelfOverride: boolean }
├─ startLevel    : rank
└─ rounds[]      : RoundRecord

RoundRecord
├─ level         : rank                     // 本局级牌（= 庄家队的等级）
├─ playerModes   : { E/N/W/S: "manual" | "auto" }   // 本局起始托管状态
├─ deal          : DealRecord
├─ trump         : TrumpRecord
├─ buried        : { player, cards, points }
├─ tricks[]      : TrickRecord              // 数组顺序 = 墩顺序
├─ bottom?       : BottomRecord | null      // 抠底结算（局末才有）
└─ result?       : RoundResult | null       // 升级结算（局末才有）

TrickRecord
├─ leadPlayer    : position                 // 显式领出者
├─ winner?       : position                 // 收墩后才有
├─ winnerTeam?   : team
├─ points?       : integer                  // 本墩分
├─ scoreAfter?   : { defending, banker }    // 收墩后的累计分
└─ plays[]       : PlayRecord               // 按出牌顺序；完成时长度 4

PlayRecord
├─ player        : position
├─ cards[]       : cardId[]                 // 实际打出的牌
├─ shape         : Shape                    // 只写非默认字段
└─ throw?        : { blocked, attempted[] } // 仅「本来想甩牌」时出现
```

> **数组下标即序号**：不存 `roundNo` / `trickNo` / `seq`。
> **字段顺序**：短的在前、长的在后（`plays` 永远最后）；领出者用 `leadPlayer` 显式给出，不靠 `plays[0]` 推断。
> 完成的一局：`tricks.length === 25`，每墩 `plays.length === 4`；
> 进行中导出时允许最后一墩不足 4 手（此时该墩没有 `winner` / `points` / `scoreAfter`）。

### 3.1 `deal`（发牌快照）

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `mode` | `"shuffle" \| "sameDeal"` | ✅ | `sameDeal` = 菜单「原样发牌…」 |
| `seed` | integer | | 仅在洗牌用了可复现种子时记录（当前 `App` 未传 seed，可先留空） |
| `hands` | `{E,N,W,S: cardId[]}` | ✅ | **发牌后的初始手牌**（每人 25 张） |
| `bottom` | `cardId[]` | ✅ | 原始底牌 8 张（抠底计分与「拿底」都依赖它） |

> 由于当前洗牌可能未固定 seed，**完整 `hands` 快照是必需的**，不能只靠 seed 复现。

### 3.2 `trump`（最终生效的亮主）

| 字段 | 类型 | 说明 |
|------|------|------|
| `suit` | `suit \| null` | `null` = 无主 |
| `declaredBy` | position | 最终生效声明的玩家；翻底定主时为翻底后的庄家 |
| `strength` | `1 \| 2 \| 3 \| 4 \| null` | `Single=1 < Pair=2 < 对小王=3 < 对大王=4`；翻底定主为 `null` |
| `cards` | `cardId[]` | 亮主 / 反主用的牌；翻底定主时为翻出的那张底牌 |
| `decidedBy` | `"bid" \| "bottomFlip"` | 正常亮主 / 无人亮主后翻底 |
| `atDealt` | integer `0..100` | **亮主时已发出的总张数**（见下） |

**`atDealt` 的定义**

- 发牌按「每人一张」推进：`revealed` 从 0 到 25，所以已发总张数 = `revealed × 4`
  （0, 4, 8, …, 100）。
- 在发牌阶段亮主 → 记录当时的 `revealed × 4`（例：发到每家第 2 张时亮主 → `atDealt: 8`）。
- 在叫主阶段（100 张已发完）才亮主 / 反主 → `atDealt: 100`。
- 翻底定主 → `atDealt: 100`。
- 若将来改成「逐张轮流发牌」，则 `atDealt` 可以是 0..100 的任意值。

> **只记录最终生效的那一次声明**；中途被反掉的声明不写入（如确实需要，可再加 `trump.bids[]`，
> 每项同样用 `atDealt` 表示时机）。

### 3.3 `buried`（埋底）

| 字段 | 类型 | 说明 |
|------|------|------|
| `player` | position | 庄家 |
| `cards` | `cardId[]` | 埋掉的 8 张（= 最终底牌） |
| `points` | integer | 底牌分（5/10/K 计分），便于快速查询 |

> 「拿底」不单独记录：回放时先给庄家加入 `deal.bottom`，再移除 `buried.cards`。

### 3.4 `tricks[]` / `plays[]`（核心）

**`TrickRecord`**（短字段在前，`plays` 最后）

| 字段 | 类型 | 说明 |
|------|------|------|
| `leadPlayer` | position | **显式领出者**（不依赖 `plays` 顺序） |
| `winner` | position | 本墩赢家（**收墩后**写入） |
| `winnerTeam` | team | 赢家所在队伍（收墩后写入） |
| `points` | integer | 本墩分（收墩后写入） |
| `scoreAfter` | `{defending, banker}` | 收墩后累计分（收墩后写入） |
| `plays` | `PlayRecord[1..4]` | 按出牌顺序；完成时 4 手 |

**`PlayRecord`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `player` | position | 出牌者 |
| `cards` | `cardId[]` | **实际打出的牌**（甩牌被拦后 = 自动出小后的那组） |
| `shape` | Shape | 牌型信息，见下表 |
| `throw` | `{blocked, attempted[]}?` | 仅当「本来想甩牌」时出现；`attempted` 是原本想甩的牌 |

**`Shape`**（只有 `type` 必填，其余按需出现）

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `type` | `single \| pair \| tractor \| throw` | ✅ | 牌型 |
| `door` | `door` | | 所属门；**省略** = 混门 / 垫牌 |
| `pairs` | integer | | 对子数；只在无法由 `type` 推出且 > 0 时出现（实际上只用于含对子的 `throw`） |
| `points` | integer | | 本手牌的分；**省略** = 0 |
| `maxSlot` | integer | | 门内最大槽位（`slotOf`），便于比较与展示 |
| `tier` | `0 \| 1 \| 2` | | `2`=毙 / `1`=同门 / `0`=垫牌；仅跟出有意义 |

**已删除的冗余字段**

- `count`：张数恒等于 `cards.length`，不写。
- `tractor`：`type === "tractor"` 时长度 = `cards.length / 2`，其它牌型必为 0，不写。

**缺省值**

- `door` 缺省 = 混门（`null`）。
- `pairs` 缺省：`single` / `throw` = 0；`pair` = 1；`tractor` = `cards.length / 2`。
- `points` 缺省 = 0。

**约定**

- 进行中的最后一墩只有 `leadPlayer` + `plays`；收墩后再补 `winner / winnerTeam / points / scoreAfter`。
- `cards` 必须是**实际生效**的牌；被拦的甩牌写进 `throw.attempted`，不要写进 `cards`。
- `leadPlayer` 显式给出领出者；`plays` 仍按出牌顺序排列（回放需要），但读取方不得用 `plays[0]` 推断领出者。
- 甩牌被拦时，记录只保留「欲甩的牌」，**不得**记录谁用哪张牌拦的（信息策略）。

### 3.5 `bottom` 与 `result`

**`BottomRecord`（抠底）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `taken` | boolean | 末墩是否由闲家方赢 |
| `winner` | position \| null | 末墩赢家 |
| `tractorLength` | integer | n：**按领出者的牌**算，对子记 1，无对子记 0 |
| `multiplier` | integer | `2^(n+1)`；未抠底为 0 |
| `cardPoints` | integer | 底牌本身的分 |
| `points` | integer | 计入闲家的分 = `cardPoints × multiplier` |

**`RoundResult`（升级结算）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `defendingPoints` | integer | 闲家得分（已含抠底加成） |
| `bankerPoints` | integer | 庄家逃分 |
| `levelChange` | `{upgradingTeam, side, steps, switchBanker}` | 升级判定 |
| `fromLevel` | rank | 升级前级牌 |
| `toLevel` | rank | 升级后级牌 |
| `lapsGained` | integer | 升过 A 的周目增量 |
| `nextBanker` | position | 下一局庄家 |

> `result` 不重复 `bottom`；两者各自只出现一次。

---

## 4. 示例

> 下面是**节选**（`jsonc`，含注释与 `"..."` 占位），完整一局约 25 个墩、100 手牌。

### 4.1 一局的开头 + 第一墩

```jsonc
{
  "schemaVersion": 1,
  "gameId": "G-20261021-01",
  "appVersion": "0.1.0",
  "rules": { "allowSelfOverride": false, },
  "startLevel": 2,
  "rounds": [
    {
      "level": 2,
      "playerModes": { "E": "auto", "N": "manual", "W": "auto", "S": "manual", },

      "deal": {
        "mode": "shuffle",
        "seed": 123456789,
        "hands": {
          "E": ["S2#0", "S2#1", "...",],
          "N": ["...",],
          "W": ["...",],
          "S": ["...",],
        },
        "bottom": ["D3#0", "C10#0", "...",],
      },

      "trump": {
        "suit": "S",
        "declaredBy": "E",
        "strength": 2,
        "cards": ["S2#0", "S2#1",],
        "decidedBy": "bid",
        "atDealt": 8,               // 发到每家第 2 张时亮主（8 = 2 × 4）
      },

      "buried": {
        "player": "E",
        "cards": ["D3#0", "C10#0", "...",],
        "points": 10,
      },

      "tricks": [
        {
          "leadPlayer": "E",
          "winner": "E",
          "winnerTeam": "EW",
          "points": 5,
          "scoreAfter": { "defending": 0, "banker": 5, },
          "plays": [
            {
              "player": "E",
              "cards": ["SA#0",],
              "shape": { "type": "single", "door": "S", },
            },
            {
              "player": "N",
              "cards": ["SK#0",],
              "shape": { "type": "single", "door": "S", },
            },
            {
              "player": "W",
              "cards": ["S7#0",],
              "shape": { "type": "single", "door": "S", },
            },
            {
              "player": "S",
              "cards": ["S5#0",],
              "shape": { "type": "single", "door": "S", "points": 5, },
            },
          ],
        },
        // ... 其余 24 墩 ...
      ],

      "bottom": {
        "taken": true,
        "winner": "S",
        "tractorLength": 1,
        "multiplier": 4,
        "cardPoints": 10,
        "points": 40,
      },

      "result": {
        "defendingPoints": 105,
        "bankerPoints": 125,
        "levelChange": {
          "upgradingTeam": "NS",
          "side": "defender",
          "steps": 0,
          "switchBanker": true,
        },
        "fromLevel": 2,
        "toLevel": 2,
        "lapsGained": 0,
        "nextBanker": "N",
      },
    },
  ],
}
```

### 4.2 甩牌被拦（自动出小）

```jsonc
{
  "player": "S",
  "cards": ["C6#0",],                     // 实际打出：最小的被拦组
  "shape": { "type": "single", "door": "C", },
  "throw": {
    "blocked": true,
    "attempted": ["C6#0", "C7#0", "C8#0",],
  },
}
```

> 展示层只允许显示「甩牌被拦了 · 欲甩 3 张」，**不得**记录或展示是哪个对手用哪张牌拦的。

---

## 5. 回放 / 校验

```ts
function replayRound(round: RoundRecord, trumpSuit: Suit | null, levelRank: Rank) {
  let hands = clone(round.deal.hands)              // 初始状态
  const banker = round.buried.player

  // 拿底 + 埋底
  hands[banker] = [...hands[banker], ...round.deal.bottom]
  hands[banker] = removeByIds(hands[banker], round.buried.cards)

  let state = createPlayState(banker)

  for (const trick of round.tricks) {
    for (const play of trick.plays) {
      const r = applyPlay(hands, state, play.player, cardsOf(play.cards),
                          trumpSuit, levelRank)
      hands = r.hands
      state = r.state
    }
    // 四家出完 → 收墩；末墩会把 buried.cards 作为底牌结算抠底
    const r = collectTrick(hands, state, round.buried.cards, trumpSuit, levelRank)
    hands = r.hands
    state = r.state
  }

  return { hands, state }
}
```

**要点**

- 没有事件层，墩与出牌顺序由数组表达；领出者以 `leadPlayer` 为准（不依赖 `plays[0]`）。
- `play.cards` 已是「实际生效」的牌，所以 `applyPlay` 不会再次触发「自动出小」；
  若要与 `throw.attempted` 校验，可单独再跑一次 `throwFallback` 比对结果。
- 收墩时把**最终底牌**（`buried.cards`）传给 `collectTrick`，末墩才能正确抠底。
- `bury` 的「先拿底、再埋底」必须在回放开始时执行一次，因为 `deal.hands` 里没有那 8 张底牌。

---

## 6. 校验不变量

| # | 不变量 |
|---|--------|
| 1 | `deal.hands` + `deal.bottom` 共 **108 张**，ID 无重复 |
| 2 | 每张牌在 `buried` / `plays` 里**恰好出现一次**（底牌只出现在 `buried`） |
| 3 | 手牌数：25 → 拿底 33 → 埋底 25 → 每出一手减去 `cards.length` → 0 |
| 4 | 完成的一局：`tricks.length === 25`，每墩 `plays.length === 4` 且 `winner / winnerTeam / points / scoreAfter` 都存在；`leadPlayer` 是四家之一，`plays` 从 `leadPlayer` 起按 `nextPlayer` 排列 |
| 5 | `shape.type` 与 `analyzeShape(cards)` 一致；`shape.door`（若有）与 `doorOf` 一致；`shape.pairs`（若有）与实际对子数一致；`shape.points`（若有）=== Σ pointValue(cards) |
| 6 | 跟出必须同门 / 或该门不足（规则可由 `validatePlay` 重跑验证） |
| 7 | `trick.points === Σ pointValue(本墩所有出牌)`；`winner` 是四家之一 |
| 8 | `Σ trick.points + buried.points === 200`（5/10/K 总分为 200） |
| 9 | `result.defendingPoints + result.bankerPoints === Σ trick.points + bottom.points` |
| 10 | 抠底后总分可 **超过** 200（`defendingPoints` 含 bonus），这是正常现象 |
| 11 | 回放得到的 `winner` / `points` / `scoreAfter` / `result` 与记录一致 |
| 12 | `trump.atDealt ∈ 0..100`；当前发牌方式下是 4 的倍数；叫主阶段与翻底定主均为 100 |

---

## 7. 与现有代码的映射

### 7.1 枚举映射

| 现有类型 | 日志取值 |
|----------|----------|
| `Suit` | `"S" \| "H" \| "C" \| "D" \| "J"`（`J` 只出现在卡牌 ID 里） |
| `Rank` | 数字（2..14, 16, 17） |
| `PlayerPosition` | `"E" \| "N" \| "W" \| "S"` |
| `HandType` | `"single" \| "pair" \| "tractor" \| "throw"` |
| `Door` | `"trump" \| "S" \| "H" \| "C" \| "D"` |
| `PlayerMode` | `"manual" \| "auto"` |

### 7.2 记录产生位置

| 记录 | 产生位置 | 数据来源 |
|------|----------|----------|
| `deal` | `App.tsx::dealRound()` | `fullHandsRef` / `originalBottomRef`；`keepDeal` → `mode:"sameDeal"` |
| `trump` | `App.tsx::applyDeclare()` / 翻底定主 effect | `Declaration`（`player/suit/strength/cardIds`）+ `revealed × 4`；翻底 → `100` |
| `buried` | `App.tsx::applyBury()`（含 AI） | `buried` 牌 + `trickPoints(buried)` |
| `tricks[].plays` | `App.tsx::commitPlay()` / AI 出牌 effect | **`applyPlay` 之后的实际牌**（含 `resolveLead` 的替换）、`analyzeShape`、`trick.throwAttempt` |
| `tricks[]` 结果 | 首手落定时写 `leadPlayer`；收墩 effect / `collectTrick()` 写其余字段 | `judgeTrick` 的赢家、`trickPoints`、收墩后的累计分 |
| `bottom` | `collectTrick()` 内 `roundOver` 时 | `state.bottom`（`settleBottom` 的返回值） |
| `result` | `App.tsx::startNextRound()` 之前 | `settleLevel()` 的返回值 |

> **撤销不留痕**：`App.tsx::undo()` 不产生任何记录。`UndoSnapshot` 额外保存
> `completedTricks`（已完成墩数）；撤销时执行 `round.tricks.length = completedTricks`，
> 当前半墩由恢复后的 `playState.trick.plays` 重新生成。
>
> 注意：`play.cards` 必须取 `applyPlay` 返回后的 `playState.trick.plays` 里的那手牌，
> 而不是玩家提交的牌——甩牌被拦时两者不同。

---

## 8. 实现清单（下个 session）

1. **`src/core/playlog.ts`**（纯函数，无 UI 依赖）
   - `encodeCardId(card, copy)` / `buildCardIdMap(hands, bottom)`
   - `createRoundRecord(...)` / `recordPlay(...)` / `closeTrick(...)`
   - `truncateRecords(round, completedTricks)`（撤销用）
   - `replayRound()` / `validateRoundRecord()`
   - `serializePlayLog()`（`JSON.stringify` → 严格 JSON）
   - `parsePlayLog()`（JSONC 解析 → `validateRoundRecord()` → 版本检查）
   - 依赖：`jsonc-parser`（`npm i jsonc-parser`）；若不想加依赖，可写一个约 60 行、能正确跳过字符串的 JSONC → 严格 JSON 预处理器。
2. **`src/core/playlog.schema.json`**：把附录 A 原样落盘（便于外部校验）。
3. **`App.tsx` 接线**：`const logRef = useRef<PlayLog>()` + `recordXxx()` 辅助函数；
   在 §7.2 列出的位置各调用一次。注意 `recordXxx` 不要放进依赖数组导致重复执行。
4. **持久化**：`localStorage`（键如 `shengji.playlog.v1`）+ 菜单「导出牌局记录…」（Blob 下载 `.json`）。
5. **UI**：`components/PlayLogPanel.tsx`，按 `tricks` 分组，每墩显示 4 手牌 + 赢家 + 墩分；
   遵守信息策略（牌局进行中不展示未公开的甩牌拦截信息）。
6. **校验**：全托管跑 10 局，逐局跑 §6 的 12 条断言；再导出→导入→重放，状态应完全一致。
7. **测试框架**：若此时仍未装 `vitest`，可继续用 `esbuild` 打包临时 `.mts` 脚本的方式验证。

---

## 9. 待定问题

| # | 问题 | 建议 |
|---|------|------|
| 1 | 「新的一局」与「下一局」的边界 | **已定**：每局一份 `PlayLog`（`rounds` 只有 1 项），下一局发牌时重建；不跨局累积 |
| 2 | 是否记录洗牌 seed | 记录（若能给 `shuffleCards` 传 seed）；完整 `hands` 快照仍然必需 |
| 3 | 被反掉的中间亮主声明 | 当前只记最终 `trump`；如需完整过程可加 `trump.bids[]`（每项带 `atDealt`） |
| 4 | 是否记录托管 / 手动切换 | 当前只记本局起始 `playerModes`；如需逐手归属，可给 `PlayRecord` 加 `mode` |
| 5 | 进行中的部分墩是否允许导出 | 建议允许，`plays` 长度 1..4；完成的一局必须为 4 |
| 6 | 单文件 vs 按局分文件 | 单文件便于导出分享；大文件场景可拆成 `G-xxx.round1.json` |

---

## 附录 A：JSON Schema（draft 2020-12）

> 可直接保存为 `src/core/playlog.schema.json`。未列出的字段默认允许（向前兼容），
> 校验时以 `schemaVersion` 为主版本。本 Schema 自身是**严格 JSON**（可直接交给 `ajv` / `jq`），
> 不要给它加注释或尾逗号。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://shengji.local/schema/play-log-v1.json",
  "title": "Shengji PlayLog",
  "type": "object",
  "required": ["schemaVersion", "gameId", "rules", "startLevel", "rounds"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "gameId": { "type": "string", "minLength": 1 },
    "appVersion": { "type": "string" },
    "rules": { "$ref": "#/$defs/rules" },
    "startLevel": { "$ref": "#/$defs/rank" },
    "rounds": { "type": "array", "items": { "$ref": "#/$defs/round" } }
  },
  "$defs": {
    "rules": {
      "type": "object",
      "required": ["allowSelfOverride"],
      "properties": { "allowSelfOverride": { "type": "boolean" } }
    },
    "position": { "enum": ["E", "N", "W", "S"] },
    "team": { "enum": ["NS", "EW"] },
    "suit": { "enum": ["S", "H", "C", "D"] },
    "door": { "enum": ["trump", "S", "H", "C", "D"] },
    "rank": { "enum": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17] },
    "handType": { "enum": ["single", "pair", "tractor", "throw"] },
    "mode": { "enum": ["manual", "auto"] },
    "cardId": {
      "type": "string",
      "pattern": "^[SHCDJ](2|3|4|5|6|7|8|9|10|11|12|13|14|16|17)#[01]$"
    },
    "cards": {
      "type": "array",
      "items": { "$ref": "#/$defs/cardId" },
      "uniqueItems": true
    },
    "scoreAfter": {
      "type": "object",
      "required": ["defending", "banker"],
      "properties": {
        "defending": { "type": "integer", "minimum": 0 },
        "banker": { "type": "integer", "minimum": 0 }
      }
    },
    "shape": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "$ref": "#/$defs/handType" },
        "door": { "$ref": "#/$defs/door" },
        "pairs": { "type": "integer", "minimum": 1 },
        "points": { "type": "integer", "minimum": 0, "multipleOf": 5 },
        "maxSlot": { "type": "integer", "minimum": 0 },
        "tier": { "enum": [0, 1, 2] }
      }
    },
    "throwInfo": {
      "type": "object",
      "required": ["blocked", "attempted"],
      "properties": {
        "blocked": { "type": "boolean" },
        "attempted": { "$ref": "#/$defs/cards" }
      }
    },
    "deal": {
      "type": "object",
      "required": ["mode", "hands", "bottom"],
      "properties": {
        "mode": { "enum": ["shuffle", "sameDeal"] },
        "seed": { "type": "integer" },
        "hands": {
          "type": "object",
          "required": ["E", "N", "W", "S"],
          "properties": {
            "E": { "$ref": "#/$defs/cards" },
            "N": { "$ref": "#/$defs/cards" },
            "W": { "$ref": "#/$defs/cards" },
            "S": { "$ref": "#/$defs/cards" }
          }
        },
        "bottom": { "$ref": "#/$defs/cards" }
      }
    },
    "trump": {
      "type": "object",
      "required": ["suit", "declaredBy", "strength", "cards", "decidedBy", "atDealt"],
      "properties": {
        "suit": { "anyOf": [{ "$ref": "#/$defs/suit" }, { "type": "null" }] },
        "declaredBy": { "$ref": "#/$defs/position" },
        "strength": { "type": ["integer", "null"], "enum": [1, 2, 3, 4, null] },
        "cards": { "$ref": "#/$defs/cards" },
        "decidedBy": { "enum": ["bid", "bottomFlip"] },
        "atDealt": { "type": "integer", "minimum": 0, "maximum": 100 }
      }
    },
    "buried": {
      "type": "object",
      "required": ["player", "cards", "points"],
      "properties": {
        "player": { "$ref": "#/$defs/position" },
        "cards": { "$ref": "#/$defs/cards" },
        "points": { "type": "integer", "minimum": 0 }
      }
    },
    "play": {
      "type": "object",
      "required": ["player", "cards", "shape"],
      "properties": {
        "player": { "$ref": "#/$defs/position" },
        "cards": { "$ref": "#/$defs/cards" },
        "shape": { "$ref": "#/$defs/shape" },
        "throw": { "$ref": "#/$defs/throwInfo" }
      }
    },
    "trick": {
      "type": "object",
      "required": ["leadPlayer", "plays"],
      "properties": {
        "leadPlayer": { "$ref": "#/$defs/position" },
        "winner": { "$ref": "#/$defs/position" },
        "winnerTeam": { "$ref": "#/$defs/team" },
        "points": { "type": "integer", "minimum": 0 },
        "scoreAfter": { "$ref": "#/$defs/scoreAfter" },
        "plays": {
          "type": "array",
          "items": { "$ref": "#/$defs/play" },
          "minItems": 1,
          "maxItems": 4
        }
      }
    },
    "bottom": {
      "type": "object",
      "required": ["taken", "winner", "tractorLength", "multiplier", "cardPoints", "points"],
      "properties": {
        "taken": { "type": "boolean" },
        "winner": { "anyOf": [{ "$ref": "#/$defs/position" }, { "type": "null" }] },
        "tractorLength": { "type": "integer", "minimum": 0 },
        "multiplier": { "type": "integer", "minimum": 0 },
        "cardPoints": { "type": "integer", "minimum": 0 },
        "points": { "type": "integer", "minimum": 0 }
      }
    },
    "levelChange": {
      "type": "object",
      "required": ["upgradingTeam", "side", "steps", "switchBanker"],
      "properties": {
        "upgradingTeam": { "$ref": "#/$defs/team" },
        "side": { "enum": ["banker", "defender"] },
        "steps": { "type": "integer", "minimum": 0 },
        "switchBanker": { "type": "boolean" }
      }
    },
    "result": {
      "type": "object",
      "required": ["defendingPoints", "bankerPoints", "levelChange"],
      "properties": {
        "defendingPoints": { "type": "integer", "minimum": 0 },
        "bankerPoints": { "type": "integer", "minimum": 0 },
        "levelChange": { "$ref": "#/$defs/levelChange" },
        "fromLevel": { "$ref": "#/$defs/rank" },
        "toLevel": { "$ref": "#/$defs/rank" },
        "lapsGained": { "type": "integer", "minimum": 0 },
        "nextBanker": { "$ref": "#/$defs/position" }
      }
    },
    "round": {
      "type": "object",
      "required": ["level", "playerModes", "deal", "tricks"],
      "properties": {
        "level": { "$ref": "#/$defs/rank" },
        "playerModes": {
          "type": "object",
          "required": ["E", "N", "W", "S"],
          "properties": {
            "E": { "$ref": "#/$defs/mode" },
            "N": { "$ref": "#/$defs/mode" },
            "W": { "$ref": "#/$defs/mode" },
            "S": { "$ref": "#/$defs/mode" }
          }
        },
        "deal": { "$ref": "#/$defs/deal" },
        "trump": { "$ref": "#/$defs/trump" },
        "buried": { "$ref": "#/$defs/buried" },
        "tricks": { "type": "array", "items": { "$ref": "#/$defs/trick" } },
        "bottom": { "$ref": "#/$defs/bottom" },
        "result": { "$ref": "#/$defs/result" }
      }
    }
  }
}
```
