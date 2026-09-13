// ============================================================
// 埋底（庄家扣底）
// ============================================================

import {
  type Card,
  Suit,
  Rank,
  isPointCard,
  pointValue,
} from './types.ts'
import { isTrump } from './trump.ts'

/** 统计一组牌的分数（5=5 分，10/K=10 分） */
export function countPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + pointValue(c.rank), 0)
}

/**
 * 一张牌的「保留价值」：越高越值得留在手中（越不该被埋）。
 *
 * 优先级（从高到低）：
 *   王 > 级牌 > 主花色 > 副牌 A > 分牌 > 副牌小牌
 */
export function keepValue(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  // 大小王：绝不该埋
  if (card.suit === Suit.Joker) return 400

  // 主牌：一般不埋
  if (isTrump(card, trumpSuit, levelRank)) {
    let v = 200 + card.rank
    if (card.rank === levelRank) v += 80 // 级牌尤其珍贵
    return v
  }

  // 副牌：点数越大越不该埋
  let v = card.rank * 3
  if (isPointCard(card.rank)) v += 80   // 分牌保留，避免落入底牌被抠
  if (card.rank === Rank.Ace) v += 30   // 副牌 A 能管牌
  return v
}

/**
 * AI 选择要埋的牌。
 *
 * 策略：优先埋「副牌中最小且无分」的牌，尽量避免埋主牌与分牌；
 * 若安全牌不足，则依次埋掉价值最低的牌。
 */
export function aiChooseBury(
  hand: Card[],
  count: number,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  return [...hand]
    .sort((a, b) =>
      keepValue(a, trumpSuit, levelRank) - keepValue(b, trumpSuit, levelRank),
    )
    .slice(0, count)
}

/** 校验埋底是否合法：张数正确，且都来自手牌 */
export function isValidBury(
  hand: Card[],
  buried: Card[],
  count: number,
): boolean {
  if (buried.length !== count) return false
  const ids = new Set(hand.map(c => c.id))
  return buried.every(c => ids.has(c.id))
}
