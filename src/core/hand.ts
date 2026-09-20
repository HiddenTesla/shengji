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

/** 该门手牌里最长的拖拉机长度（对数）；不足 2 返回 0 */
export function maxTractorLength(
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
// 校验
// ------------------------------------------------------------

export interface PlayValidation {
  ok: boolean
  reason?: string
}

/** 领出校验：必须同一门（甩牌合法性需「无人能管」，留待步骤 5） */
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
// 3. 甩牌：牌型识别为 Throw，但「无人能管」的合法性校验需要大小判断（步骤 5），暂未启用。
// 4. 毙牌：补牌全部为主牌时按主牌门套用「有对必对 / 有拖必拖」。
