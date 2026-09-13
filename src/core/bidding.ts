// ============================================================
// 叫主（亮主 / 反主 / 无主）
// ============================================================

import {
  type Card,
  type CardId,
  type PlayerPosition,
  Suit,
  Rank,
  SUIT_SYMBOL,
} from './types.ts'
import { evaluateTrumpStrength } from './trump.ts'

/**
 * 叫主强度（越大越强）
 *   Single    单张级牌亮主
 *   Pair      一对级牌反主
 *   JokerPair 一对王 → 无主
 */
export enum BidStrength {
  Single = 1,
  Pair = 2,
  JokerPair = 3,
}

/** 一次叫主声明 */
export interface Declaration {
  player: PlayerPosition
  /** 主花色；null 表示无主 */
  suit: Suit | null
  strength: BidStrength
  /** 用于亮主的牌 ID */
  cardIds: CardId[]
}

/** 叫主回合状态 */
export interface BidState {
  /** 当前最高声明（null = 尚无人叫主） */
  current: Declaration | null
  /** 自上次声明后的连续过牌数 */
  passes: number
  /** 当前轮到 ALL_POSITIONS 中的索引 */
  turnIndex: number
  /** 全部声明记录 */
  history: Declaration[]
}

/** 初始叫主状态 */
export function createBidState(firstTurnIndex = 0): BidState {
  return {
    current: null,
    passes: 0,
    turnIndex: firstTurnIndex,
    history: [],
  }
}

// ------------------------------------------------------------
// 合法声明
// ------------------------------------------------------------

/**
 * 列出某手牌当前可做的所有声明（不含强度校验）
 *
 * 规则：
 *   - 持有级牌 → 可"亮主"（单张）
 *   - 持有同花色一对级牌 → 可"反主"（对子）
 *   - 持有任意两张王 → 可"无主"
 */
export function getPossibleDeclarations(
  hand: Card[],
  levelRank: Rank,
  player: PlayerPosition,
): Declaration[] {
  const decls: Declaration[] = []

  // 按花色归集级牌
  const levelBySuit = new Map<Suit, Card[]>()
  for (const c of hand) {
    if (c.rank === levelRank && c.suit !== Suit.Joker) {
      const arr = levelBySuit.get(c.suit) ?? []
      arr.push(c)
      levelBySuit.set(c.suit, arr)
    }
  }
  for (const [suit, cards] of levelBySuit) {
    // 单张亮主
    decls.push({
      player,
      suit,
      strength: BidStrength.Single,
      cardIds: [cards[0].id],
    })
    // 对子反主
    if (cards.length >= 2) {
      decls.push({
        player,
        suit,
        strength: BidStrength.Pair,
        cardIds: [cards[0].id, cards[1].id],
      })
    }
  }

  // 对王 → 无主
  const jokers = hand.filter(c => c.suit === Suit.Joker)
  if (jokers.length >= 2) {
    decls.push({
      player,
      suit: null,
      strength: BidStrength.JokerPair,
      cardIds: [jokers[0].id, jokers[1].id],
    })
  }

  return decls
}

/** 新声明能否覆盖当前声明（无当前声明时总是可以） */
export function canOverride(
  next: Declaration,
  current: Declaration | null,
): boolean {
  if (!current) return true
  return next.strength > current.strength
}

/** 声明的中文标签，如 "亮主 ♠"、"反主 ♥"、"无主" */
export function declarationLabel(d: Declaration): string {
  if (d.strength === BidStrength.JokerPair) return '无主'
  if (d.suit === null) return '无主'
  const sym = SUIT_SYMBOL[d.suit]
  return d.strength === BidStrength.Pair ? `反主 ${sym}` : `亮主 ${sym}`
}

// ------------------------------------------------------------
// AI 决策（规则驱动，无学习能力）
// ------------------------------------------------------------

/**
 * AI 选择叫主声明
 *
 * 策略：
 *   - 无主（对王）：固定较高基础分
 *   - 其他：按该花色作为主牌的综合强度评分（对子额外加分）
 *   - 抢庄（当前无人叫主）时降低门槛，鼓励先手亮主
 *
 * @returns 声明对象，或 null 表示过牌
 */
export function aiChooseDeclare(
  hand: Card[],
  levelRank: Rank,
  current: Declaration | null,
  player: PlayerPosition,
): Declaration | null {
  const options = getPossibleDeclarations(hand, levelRank, player)
    .filter(d => canOverride(d, current))

  if (options.length === 0) return null

  let best: Declaration | null = null
  let bestScore = -Infinity

  for (const d of options) {
    let score: number
    if (d.strength === BidStrength.JokerPair) {
      // 无主：依赖手中的王和级牌数量
      const jokers = hand.filter(c => c.suit === Suit.Joker).length
      const levels = hand.filter(c => c.rank === levelRank).length
      score = 60 + jokers * 20 + levels * 10
    }
    else {
      const info = evaluateTrumpStrength(hand, d.suit as Suit, levelRank)
      score = info.score
      if (d.strength === BidStrength.Pair) score += 25
    }

    // 抢庄优势
    if (current === null) score += 45

    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }

  const threshold = current === null ? 110 : 150
  return bestScore >= threshold ? best : null
}
