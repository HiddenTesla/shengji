// ============================================================
// 牌型 / 门 / 跟牌合法性（步骤 4）
//
// 规则实现说明（默认取值，见文件末尾「规则取舍」）：
//   1. 有此门必跟此门（有几张跟几张）
//   2. 该门足够时，出的牌必须全部来自该门
//   3. 有对必对：首出含 P 个对子时，该门内对子够就必须出 P 个对（不足则全出）
//   4. 有拖必拖：首出为长度 L 的拖拉机且该门内有同长度拖拉机时必须出
//   5. 该门不足：必须先出完该门，剩余用其它门补（垫牌 / 用主牌毙）
//   6. 毙牌：补牌全部为主牌时，同样受「有对必对 / 有拖必拖」约束
//   7. 甩牌：领出多张组合时必须「其余三家要不上」，否则「自动出小」（见 throwFallback）
// ============================================================

import {
  type Card,
  type HandType,
  type Rank,
  type Suit,
  RANK_NAME,
  SUIT_SYMBOL,
  HandType as HT,
  Rank as R,
  Suit as S,
} from './types.ts'
import { isTrump } from './trump.ts'

// ------------------------------------------------------------
// 门
// ------------------------------------------------------------

/** 门：主牌门（'trump'）或某个副花色 */
export type Door = Suit | 'trump'

/** 判定一张牌属于哪一门 */
export function doorOf(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Door {
  return isTrump(card, trumpSuit, levelRank) ? 'trump' : card.suit
}

/** 门的显示名 */
export function doorLabel(door: Door): string {
  return door === 'trump' ? '主牌' : SUIT_SYMBOL[door]
}

// ------------------------------------------------------------
// 门内次序（用于拖拉机判定）
// ------------------------------------------------------------

/** 2..A（升序），用于计算门内「槽位」 */
const BASE_RANKS: readonly Rank[] = [
  R.Two, R.Three, R.Four, R.Five, R.Six, R.Seven, R.Eight,
  R.Nine, R.Ten, R.Jack, R.Queen, R.King, R.Ace,
]

/** 去掉级牌后的点数序列（升序）——级牌从副花色中抽走后，两侧视为相邻（搭桥） */
function levelFreeRanks(levelRank: Rank): Rank[] {
  return BASE_RANKS.filter(r => r !== levelRank)
}

/**
 * 牌在其「门」内的次序槽位（越大越强）。
 *
 * - 副花色：点数升序（去掉级牌）
 * - 主牌门（有主）：主花色非级牌升序 → 副级牌 → 主级牌 → 小王 → 大王
 * - 主牌门（无主）：级牌 → 小王 → 大王
 *
 * 相邻槽位 = 连续（可用于拖拉机）；同槽位（如不同花色的副级牌）不算连续。
 */
export function slotOf(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const lf = levelFreeRanks(levelRank)
  const isLevel = card.rank === levelRank

  if (card.suit === S.Joker) {
    if (trumpSuit === null) {
      return card.rank === R.BigJoker ? 2 : 1
    }
    return card.rank === R.BigJoker ? lf.length + 3 : lf.length + 2
  }

  if (isLevel) {
    if (trumpSuit === null) return 0
    return card.suit === trumpSuit ? lf.length + 1 : lf.length
  }

  return lf.indexOf(card.rank)
}

/** 按「门内强弱」升序排序（副牌在前、主牌在后，用于 AI 出小牌） */
export function sortByStrengthAsc(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  return [...cards].sort((a, b) => {
    const at = a.suit === S.Joker || isTrump(a, trumpSuit, levelRank) ? 1 : 0
    const bt = b.suit === S.Joker || isTrump(b, trumpSuit, levelRank) ? 1 : 0
    if (at !== bt) return at - bt
    const as = slotOf(a, trumpSuit, levelRank)
    const bs = slotOf(b, trumpSuit, levelRank)
    if (as !== bs) return as - bs
    return a.rank - b.rank
  })
}

// ------------------------------------------------------------
// 牌型
// ------------------------------------------------------------

/** 一手牌的构成 */
export interface HandShape {
  type: HandType
  /** 所属门；null 表示混门（非法） */
  door: Door | null
  count: number
  /** 含有的对子数 */
  pairs: number
  /** 拖拉机长度（对数）；0 = 非拖拉机 */
  tractor: number
}

interface PairUnit {
  slot: number
  cards: Card[]
}

/** 把牌拆成「对子单元」（同花色同点数 2 张） */
function pairUnits(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PairUnit[] {
  const byKey = new Map<string, Card[]>()
  for (const c of cards) {
    const k = `${c.suit}|${c.rank}`
    const arr = byKey.get(k) ?? []
    arr.push(c)
    byKey.set(k, arr)
  }
  const units: PairUnit[] = []
  for (const arr of byKey.values()) {
    if (arr.length >= 2) {
      units.push({ slot: slotOf(arr[0], trumpSuit, levelRank), cards: arr.slice(0, 2) })
    }
  }
  return units
}

/** 在给定对子单元中找一段「连续槽位」的拖拉机 */
function findTractorRun(units: PairUnit[], length: number): PairUnit[] | null {
  if (length < 2 || units.length < length) return null
  const sorted = [...units].sort((a, b) => a.slot - b.slot)
  for (let i = 0; i + length <= sorted.length; i++) {
    let ok = true
    for (let j = 1; j < length; j++) {
      if (sorted[i + j].slot !== sorted[i + j - 1].slot + 1) {
        ok = false
        break
      }
    }
    if (ok) return sorted.slice(i, i + length)
  }
  return null
}

/**
 * 该门手牌里最长的「连续对子段」长度（对数）：
 *   单个对子记 1；无对子记 0；≥2 即为拖拉机。
 * 同槽位的不同花色副级牌只算一个（不连续），与拖拉机判定一致。
 */
export function maxPairRunLength(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const units = pairUnits(cards, trumpSuit, levelRank)
  const slots = [...new Set(units.map(u => u.slot))].sort((a, b) => a - b)
  let best = 0
  let cur = 0
  for (let i = 0; i < slots.length; i++) {
    cur = (i > 0 && slots[i] === slots[i - 1] + 1) ? cur + 1 : 1
    if (cur > best) best = cur
  }
  return best
}

/** 该门手牌里最长的拖拉机长度（对数）；不足 2 返回 0 */
export function maxTractorLength(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const best = maxPairRunLength(cards, trumpSuit, levelRank)
  return best >= 2 ? best : 0
}

/** 分析一手牌的构成 */
export function analyzeShape(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): HandShape {
  const count = cards.length
  if (count === 0) {
    return { type: HT.Throw, door: null, count: 0, pairs: 0, tractor: 0 }
  }

  const door = doorOf(cards[0], trumpSuit, levelRank)
  const mixed = cards.some(c => doorOf(c, trumpSuit, levelRank) !== door)
  if (mixed) {
    return { type: HT.Throw, door: null, count, pairs: 0, tractor: 0 }
  }

  const units = pairUnits(cards, trumpSuit, levelRank)
  const pairs = units.length

  // 全部由对子组成且连续 → 拖拉机
  let tractor = 0
  const allPairs = count % 2 === 0 && pairs === count / 2
  if (allPairs && pairs >= 2) {
    if (findTractorRun(units, pairs)) tractor = pairs
  }

  let type: HandType
  if (count === 1) type = HT.Single
  else if (count === 2 && pairs === 1) type = HT.Pair
  else if (tractor >= 2) type = HT.Tractor
  else type = HT.Throw

  return { type, door, count, pairs, tractor }
}

// ------------------------------------------------------------
// 甩牌合法性（其余三家「要不上」）
// ------------------------------------------------------------

/** 同门内一段连续对子：长度 1 = 独立对子，长度 ≥2 = 拖拉机 */
interface SlotRun {
  /** 连续槽位个数（即对子数） */
  length: number
  /** 起始（最小）槽位 */
  minSlot: number
  /** 末尾（最大）槽位 */
  maxSlot: number
  /** 该段包含的牌（按槽位升序；长度 1 为 2 张，长度 L 为 2L 张） */
  cards: Card[]
  /** 代表牌（用于提示信息） */
  sample: Card
}

/**
 * 把对子单元切成若干「极大连续段」。
 * 同槽位的不同花色副级牌只保留一个（与 maxTractorLength 一致：不算连续）。
 */
function slotRuns(units: PairUnit[]): SlotRun[] {
  const bySlot = new Map<number, PairUnit>()
  for (const u of units) {
    if (!bySlot.has(u.slot)) bySlot.set(u.slot, u)
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b)
  const runs: SlotRun[] = []
  let start = 0
  for (let i = 1; i <= slots.length; i++) {
    if (i === slots.length || slots[i] !== slots[i - 1] + 1) {
      const runUnits = slots.slice(start, i).map(sl => bySlot.get(sl)!)
      runs.push({
        length: i - start,
        minSlot: slots[start],
        maxSlot: slots[i - 1],
        cards: runUnits.flatMap(u => u.cards),
        sample: runUnits[0].cards[0],
      })
      start = i
    }
  }
  return runs
}

/** 拖拉机强弱比较：长度优先（越长越大），同长度比点数 */
function tractorBigger(a: SlotRun, b: SlotRun): boolean {
  return a.length !== b.length ? a.length > b.length : a.maxSlot > b.maxSlot
}

/** 甩牌被拦时的「自动出小」结果 */
export interface ThrowFallback {
  /** 改为实际出这个组 */
  cards: Card[]
  group: 'single' | 'pair' | 'tractor'
}

/**
 * 甩牌被拦 → 「自动出小」：按 **单张 → 对子 → 拖拉机** 的顺序，
 * 取第一个「有被拦组」的类型里**最小**的那个被拦组。
 *
 * 例（级牌 2）：
 *   - 甩 678 而对手有 7 → 出 6（最小被拦单张）
 *   - 甩 AKJJ 而对手有 QQ（AK 均大出）→ 出 JJ
 *   - 甩 AKQQ8899 而对手有 1010JJ（AK、QQ 均大出）→ 出 8899（拖）
 *
 * 判定细节（沿用已定规则）：
 *   - 不考虑「毙牌」：只看该门内要不上（对手该门已空即可甩）。
 *   - **不检查自己剩下的牌**：手上可以留着比甩出牌更大的牌。
 *   - 对子统计含对方拖拉机内部的对子；拖拉机「更长者更大」，同长比点数。
 *
 * 返回 `null` = 三家要不上，甩牌成立（按原牌出）。
 * 返回非 null 时，出牌者改为出 `cards`（其余牌留在手上）；
 * 对局中**只能**告知「甩牌被拦了」，不得透露是谁 / 哪些牌被拦 / 对方持有什么。
 */
export function throwFallback(
  cards: Card[],
  opponents: Card[][],
  trumpSuit: Suit | null,
  levelRank: Rank,
): ThrowFallback | null {
  const door = analyzeShape(cards, trumpSuit, levelRank).door
  if (door === null) return null

  const slot = (c: Card) => slotOf(c, trumpSuit, levelRank)
  const units = pairUnits(cards, trumpSuit, levelRank)
  const pairedIds = new Set(units.flatMap(u => u.cards.map(c => c.id)))
  const singles = cards.filter(c => !pairedIds.has(c.id))
  const runs = slotRuns(units)
  const alonePairs = runs.filter(r => r.length === 1)
  const tractors = runs.filter(r => r.length >= 2)

  const oppInDoor = opponents.map(h =>
    h.filter(c => doorOf(c, trumpSuit, levelRank) === door))
  const oppPairs = oppInDoor.flatMap(h => pairUnits(h, trumpSuit, levelRank))
  const oppTractors = oppInDoor.flatMap(h =>
    slotRuns(pairUnits(h, trumpSuit, levelRank)).filter(r => r.length >= 2))

  // 1) 单张：有更大的牌 → 被拦，取最小的被拦单张
  const blockedSingles = singles
    .filter(s => oppInDoor.some(h => h.some(c => slot(c) > slot(s))))
    .sort((a, b) => slot(a) - slot(b))
  if (blockedSingles.length > 0) {
    return { cards: [blockedSingles[0]], group: 'single' }
  }

  // 2) 独立对子：有更大的对子 → 被拦，取最小的被拦对子
  const blockedPairs = alonePairs
    .filter(p => oppPairs.some(u => u.slot > p.maxSlot))
    .sort((a, b) => a.maxSlot - b.maxSlot)
  if (blockedPairs.length > 0) {
    return { cards: [...blockedPairs[0].cards], group: 'pair' }
  }

  // 3) 拖拉机：有更大（更长，或同长更大）的拖拉机 → 被拦，取最小的被拦拖拉机
  const blockedTractors = tractors
    .filter(t => oppTractors.some(r => tractorBigger(r, t)))
    .sort((a, b) => (a.length !== b.length
      ? a.length - b.length
      : a.maxSlot - b.maxSlot))
  if (blockedTractors.length > 0) {
    return { cards: [...blockedTractors[0].cards], group: 'tractor' }
  }

  return null
}

// ------------------------------------------------------------
// 校验
// ------------------------------------------------------------

export interface PlayValidation {
  ok: boolean
  reason?: string
}

/**
 * 领出校验（出牌前）：只要求同一门
 *
 * 甩牌合法性**不在这里**判定——出牌前检查会泄露其余三家手牌，
 * 改为出牌之后由 `play.ts::applyPlay` 调用 `throwFallback`：三家要不上则按原牌出，
 * 被拦则改出最小的被拦组（并记入 `trick.throwBlocked`）。
 */
export function validateLead(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayValidation {
  if (cards.length === 0) return { ok: false, reason: '请先选牌' }
  const shape = analyzeShape(cards, trumpSuit, levelRank)
  if (shape.door === null) {
    return { ok: false, reason: '领出必须同一门（主牌算一门）' }
  }
  return { ok: true }
}

/**
 * 对「某一部分牌」检查对子 / 拖拉机要求
 *
 * @param played    实际出的该部分牌
 * @param available 该门手牌（用于判断"有没有对子/拖拉机"）
 */
function checkGroup(
  played: Card[],
  available: Card[],
  leadPairs: number,
  leadTractor: number,
  trumpSuit: Suit | null,
  levelRank: Rank,
  doorName: string,
): PlayValidation {
  const need = played.length
  const availUnits = pairUnits(available, trumpSuit, levelRank)
  const playedUnits = pairUnits(played, trumpSuit, levelRank)
  const maxPairsFit = Math.floor(need / 2)

  // 有对必对
  const needPairs = Math.min(leadPairs, availUnits.length, maxPairsFit)
  if (playedUnits.length < needPairs) {
    return { ok: false, reason: `${doorName}内有对子，必须跟对子` }
  }

  // 有拖必拖（仅在"出得下"时才要求；且手里确实有同长度拖拉机）
  if (leadTractor >= 2 && need >= leadTractor * 2) {
    if (findTractorRun(availUnits, leadTractor)) {
      const playedTractor = maxTractorLength(played, trumpSuit, levelRank)
      if (playedTractor < leadTractor) {
        return { ok: false, reason: `${doorName}内有${leadTractor}连对，必须跟拖拉机` }
      }
    }
  }

  return { ok: true }
}

/** 跟牌校验 */
export function validateFollow(
  hand: Card[],
  lead: HandShape,
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayValidation {
  if (cards.length === 0) return { ok: false, reason: '请先选牌' }
  if (cards.length !== lead.count) {
    return { ok: false, reason: `需出 ${lead.count} 张` }
  }
  if (lead.door === null) {
    return { ok: false, reason: '首出门不明' }
  }

  const door = lead.door
  const name = doorLabel(door)
  const handInDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) === door)
  const playedInDoor = cards.filter(c => doorOf(c, trumpSuit, levelRank) === door)
  const playedOutDoor = cards.filter(c => doorOf(c, trumpSuit, levelRank) !== door)

  // ---- 该门足够：必须全部跟该门 ----
  if (handInDoor.length >= lead.count) {
    if (playedOutDoor.length > 0) {
      return { ok: false, reason: `手上还有${name}，必须跟${name}` }
    }
    return checkGroup(playedInDoor, handInDoor, lead.pairs, lead.tractor, trumpSuit, levelRank, name)
  }

  // ---- 该门不足：必须出完该门，其余补齐 ----
  if (playedInDoor.length !== handInDoor.length) {
    return {
      ok: false,
      reason: `必须先出完手上的${name}（共 ${handInDoor.length} 张）`,
    }
  }

  // 补牌全为主牌 → 视为毙牌，同样受对子/拖拉机约束
  const allTrumpFill = playedOutDoor.length > 0
    && playedOutDoor.every(c => doorOf(c, trumpSuit, levelRank) === 'trump')
  if (allTrumpFill) {
    const handTrump = hand.filter(c => doorOf(c, trumpSuit, levelRank) === 'trump')
    return checkGroup(
      playedOutDoor,
      handTrump,
      lead.pairs,
      lead.tractor,
      trumpSuit,
      levelRank,
      '主牌',
    )
  }

  return { ok: true }
}

// ------------------------------------------------------------
// 托管 AI：构造合法出牌
// ------------------------------------------------------------

/** 从 group 中挑 need 张，尽量满足对子/拖拉机要求 */
function pickForGroup(
  group: Card[],
  available: Card[],
  need: number,
  leadPairs: number,
  leadTractor: number,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  const picked: Card[] = []
  const rest = [...group]
  const take = (cs: Card[]) => {
    const ids = new Set(cs.map(c => c.id))
    for (let i = rest.length - 1; i >= 0; i--) {
      if (ids.has(rest[i].id)) rest.splice(i, 1)
    }
    picked.push(...cs)
  }

  const availUnits = pairUnits(available, trumpSuit, levelRank)

  // 1) 拖拉机
  if (leadTractor >= 2 && need >= leadTractor * 2) {
    const unitsInGroup = pairUnits(group, trumpSuit, levelRank)
    const run = findTractorRun(unitsInGroup, leadTractor)
    if (run) take(run.flatMap(u => u.cards))
  }

  // 2) 对子
  if (picked.length === 0 && leadPairs >= 1) {
    const needPairs = Math.min(leadPairs, availUnits.length, Math.floor(need / 2))
    if (needPairs > 0) {
      const unitsInGroup = pairUnits(group, trumpSuit, levelRank)
        .sort((a, b) => a.slot - b.slot)
      for (let i = 0; i < needPairs && i < unitsInGroup.length; i++) {
        take(unitsInGroup[i].cards)
      }
    }
  }

  // 3) 单张补齐（从小到大）
  for (const c of sortByStrengthAsc(rest, trumpSuit, levelRank)) {
    if (picked.length >= need) break
    picked.push(c)
  }

  return picked.slice(0, need)
}

/** AI 领出：优先出副牌中最小的一张 */
export function chooseLead(
  hand: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  const side = hand.filter(c => doorOf(c, trumpSuit, levelRank) !== 'trump')
  const pool = side.length > 0 ? side : hand
  const sorted = sortByStrengthAsc(pool, trumpSuit, levelRank)
  return sorted.length > 0 ? [sorted[0]] : []
}

/** AI 跟牌：构造一手合法牌 */
export function chooseFollow(
  hand: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  const door = lead.door
  if (door === null) return []

  const need = lead.count
  const handInDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) === door)

  // 该门足够
  if (handInDoor.length >= need) {
    return pickForGroup(
      handInDoor, handInDoor, need,
      lead.pairs, lead.tractor, trumpSuit, levelRank,
    )
  }

  // 该门不足：全部出完 + 补齐（优先垫副牌，必要时用主牌毙）
  const picked = [...handInDoor]
  const restNeed = need - handInDoor.length
  const outDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) !== door)
  const sideFill = sortByStrengthAsc(
    outDoor.filter(c => doorOf(c, trumpSuit, levelRank) !== 'trump'),
    trumpSuit, levelRank,
  )
  const trumpFill = outDoor.filter(c => doorOf(c, trumpSuit, levelRank) === 'trump')

  const sideTaken = sideFill.slice(0, restNeed)
  picked.push(...sideTaken)

  const remain = restNeed - sideTaken.length
  if (remain > 0) {
    const handTrump = hand.filter(c => doorOf(c, trumpSuit, levelRank) === 'trump')
    picked.push(...pickForGroup(
      trumpFill, handTrump, remain,
      lead.pairs, lead.tractor, trumpSuit, levelRank,
    ))
  }

  // 兜底：保证张数正好等于首出张数
  if (picked.length < need) {
    const pickedIds = new Set(picked.map(c => c.id))
    const rest = sortByStrengthAsc(
      hand.filter(c => !pickedIds.has(c.id)),
      trumpSuit,
      levelRank,
    )
    for (const c of rest) {
      if (picked.length >= need) break
      picked.push(c)
    }
  }

  return picked.slice(0, need)
}

/** 牌的可读名（用于提示 / 日志） */
export function cardsLabel(cards: Card[]): string {
  return cards
    .map(c => (c.suit === S.Joker
      ? RANK_NAME[c.rank]
      : `${SUIT_SYMBOL[c.suit]}${RANK_NAME[c.rank]}`))
    .join(' ')
}

// ============================================================
// 规则取舍（默认值，可后续调整）
// ============================================================
// 1. 级牌抽走后「搭桥」：打 5 时 ♠4 与 ♠6 视为连续 → 已实现（levelFreeRanks）。
// 2. 主牌拖拉机「允许跨档」：按 主花色非级牌 → 副级牌 → 主级牌 → 小王 → 大王 的
//    槽位顺序，相邻槽位即成对即算拖拉机（如 ♥2对+♠2对、♠A对+小王对）。
//    不同花色的副级牌共享同一槽位 → 不算连续。
// 3. 甩牌：**出牌之后**按「其余三家要不上」判定（throwFallback，由 applyPlay 调用）——
//    含单张比最小单张、含独立对子比最小对子（含对方拖拉机里的对子）、
//    含拖拉机比最小拖拉机（长度优先：越长越大，同长度比点数）。
//    不考虑毙牌：只要该门内要不上即可甩（对手该门已空即可）。
//    **被拦处理**：不拦出牌，改为「自动出小」（throwFallback）——按 单张 → 对子 →
//    拖拉机 顺序，取第一个有被拦组的类型里最小的被拦组来出，其余牌留在手上。
//    纯 Single / Pair / Tractor 领出不是甩牌，**不受**此检查（如 4455 可随便领出）。
// 4. 毙牌：补牌全部为主牌时按主牌门套用「有对必对 / 有拖必拖」。
