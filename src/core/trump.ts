// ============================================================
// 主牌判定
// ============================================================

import {
  type Card,
  Suit,
  Rank,
} from './types.ts'

export interface TrumpInfo {
  /** 主花色（null = 无主） */
  suit: Suit | null
  /** 当前级牌点数 */
  levelRank: Rank
}

/**
 * 判断一张牌是否为主牌
 *
 * 主牌范围：
 * 1. 大小王
 * 2. 级牌（当前等级对应的所有花色的牌）
 * 3. 主花色的所有牌
 */
export function isTrump(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  // 大小王永远是主牌
  if (card.suit === Suit.Joker) return true
  // 级牌（无论什么花色）是主牌
  if (card.rank === levelRank) return true
  // 主花色是主牌
  if (trumpSuit !== null && card.suit === trumpSuit) return true
  return false
}

/**
 * 获取某张牌在"主牌中的排名"（用于主牌内部比较）
 * 数值越大越强
 */
export function getTrumpRank(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  // 大王 > 小王 > 级牌(主花色) > 级牌(非主花色) > 主花色(非级牌) > 副牌

  const isJoker = card.suit === Suit.Joker
  const isLevel = card.rank === levelRank
  const isTrumpSuit = card.suit === trumpSuit

  // 大王
  if (isJoker && card.rank === Rank.BigJoker) return 6
  // 小王
  if (isJoker && card.rank === Rank.SmallJoker) return 5
  // 级牌（主花色）
  if (isLevel && isTrumpSuit) return 4
  // 级牌（非主花色）— 仅在无主时出现
  if (isLevel && trumpSuit === null) return 4
  // 级牌（副花色）
  if (isLevel) return 3
  // 主花色非级牌
  if (isTrumpSuit) return 2
  // 副牌
  return 1
}

/**
 * 判断一张牌在特定主牌设定下是否能压制另一张牌
 *
 * @param leadSuit 首出的花色（用于跟牌判断）
 */
export function canCardBeat(
  card: Card,
  target: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
  leadSuit: Suit,
): boolean {
  const cardTrumpRank = getTrumpRank(card, trumpSuit, levelRank)
  const targetTrumpRank = getTrumpRank(target, trumpSuit, levelRank)

  // 如果目标不是首出花色也不是主牌（垫牌），任何牌都能压
  if (
    target.suit !== leadSuit
    && target.suit !== trumpSuit
    && target.rank !== levelRank
    && target.suit !== Suit.Joker
  ) {
    return true
  }

  // 如果 card 是主牌，target 不是主牌
  if (cardTrumpRank > 1 && targetTrumpRank === 1) return true
  // 如果 card 不是主牌，target 是主牌
  if (cardTrumpRank === 1 && targetTrumpRank > 1) return false

  // 同级别（都是主牌或都是副牌），按点数比较
  if (card.suit === target.suit) {
    return card.rank > target.rank
  }

  // 不同花色但同为主牌级别（如级牌 vs 主花色）
  return cardTrumpRank > targetTrumpRank
}

/**
 * 获取某花色的所有主牌排名信息（用于叫主决策）
 */
export interface TrumpStrengthInfo {
  /** 主花色 */
  suit: Suit | null
  /** 该花色主牌数量 */
  trumpCount: number
  /** 大小王数量 */
  jokerCount: number
  /** 级牌数量 */
  levelCount: number
  /** 主花 A 数量 */
  aceCount: number
  /** 主花对子数量 */
  pairCount: number
  /** 综合评分 */
  score: number
}

/**
 * 评估一个花色作为主牌的强度（用于 AI 叫主）
 */
export function evaluateTrumpStrength(
  cards: Card[],
  suit: Suit,
  levelRank: Rank,
): TrumpStrengthInfo {
  const suitCards = cards.filter(c => c.suit === suit)
  const jokerCount = cards.filter(c => c.suit === Suit.Joker).length
  const levelCount = cards.filter(c => c.rank === levelRank).length
  const aceCount = suitCards.filter(c => c.rank === Rank.Ace).length

  // 统计对子
  const rankCounts = new Map<Rank, number>()
  for (const c of suitCards) {
    const count = rankCounts.get(c.rank) ?? 0
    rankCounts.set(c.rank, count + 1)
  }
  const pairCount = Array.from(rankCounts.values()).filter(v => v >= 2).length

  // 综合评分
  const score = suitCards.length * 10
    + jokerCount * 30
    + levelCount * 15
    + aceCount * 8
    + pairCount * 5

  return {
    suit,
    trumpCount: suitCards.length,
    jokerCount,
    levelCount,
    aceCount,
    pairCount,
    score,
  }
}

