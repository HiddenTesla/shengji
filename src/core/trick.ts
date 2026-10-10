// ============================================================
// 墩比较（步骤 5）
//
// 判定规则：
//   1. 只有「同门或主牌」的牌才可能赢；其余为垫牌，不能赢
//   2. 主牌 > 副牌（毙）；主牌之间按主牌次序比大小（盖毙）
//   3. 同门之间按门内次序比大小
//   4. 必须与首出「同型」才可争胜：单张 vs 单张、对子 vs 对子、
//      拖拉机 vs 同长度拖拉机；甩牌按「张数相同 + 最大牌」
//      （甩牌被拦时已在 play.ts::applyPlay 里「自动出小」改出）
//   5. 同大时先出者赢（使用严格大于比较）
// ============================================================

import {
  type Card,
  type HandType,
  type PlayedCards,
  type PlayerPosition,
  type Rank,
  type Suit,
  HandType as HT,
} from './types.ts'
import {
  type Door,
  type HandShape,
  analyzeShape,
  slotOf,
} from './hand.ts'

/**
 * 一手牌在本墩的层级：
 *   2 = 主牌毙（首出非主）
 *   1 = 与首出同门（首出为主牌时即主牌）
 *   0 = 垫牌 —— 不能赢
 */
function tierOf(
  cards: Card[],
  leadDoor: Door,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const shape = analyzeShape(cards, trumpSuit, levelRank)
  const door = shape.door
  if (door === null) return 0
  if (door === 'trump') return leadDoor === 'trump' ? 1 : 2
  return door === leadDoor ? 1 : 0
}

/** 同层内比较用的强度 = 该手牌中最大的「门内槽位」 */
function strengthOf(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  let max = -Infinity
  for (const c of cards) {
    const s = slotOf(c, trumpSuit, levelRank)
    if (s > max) max = s
  }
  return max
}

/** 牌型是否能与首出「争胜」（需同型同长度） */
export function canCompete(shape: HandShape, lead: HandShape): boolean {
  switch (lead.type) {
    case HT.Single:
      return shape.type === HT.Single
    case HT.Pair:
      return shape.type === HT.Pair
    case HT.Tractor:
      return shape.type === HT.Tractor && shape.tractor === lead.tractor
    default:
      // 甩牌：按「张数相同」比较，胜负看最大牌（被拦时已在出牌前「自动出小」改出）
      return shape.count === lead.count
  }
}

/**
 * candidate 能否压过当前的 best
 *
 * @param lead 首出牌的构成（决定首出门与牌型）
 */
export function beats(
  candidate: Card[],
  best: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  const leadDoor = lead.door
  if (leadDoor === null) return false

  const ct = tierOf(candidate, leadDoor, trumpSuit, levelRank)
  const bt = tierOf(best, leadDoor, trumpSuit, levelRank)
  // 不同层：层级高的赢（主牌毙 > 同门 > 垫牌）
  if (ct !== bt) return ct > bt
  // 同为垫牌：谁也赢不了（先出者保持）
  if (ct === 0) return false

  const cs = analyzeShape(candidate, trumpSuit, levelRank)
  const bs = analyzeShape(best, trumpSuit, levelRank)
  if (!canCompete(cs, lead)) return false
  if (!canCompete(bs, lead)) return false

  return strengthOf(candidate, trumpSuit, levelRank)
    > strengthOf(best, trumpSuit, levelRank)
}

/** 判定本墩赢家（按出牌顺序，同大时先出者赢） */
export function judgePlays(
  plays: PlayedCards[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayerPosition {
  if (plays.length === 0) {
    throw new Error('judgePlays: 没有出牌记录')
  }
  let best = plays[0]
  for (let i = 1; i < plays.length; i++) {
    if (beats(plays[i].cards, best.cards, lead, trumpSuit, levelRank)) {
      best = plays[i]
    }
  }
  return best.player
}
