// ============================================================
// 牌组、洗牌、发牌
// ============================================================

import {
  type Card,
  type CardId,
  Suit,
  Rank,
  ALL_POSITIONS,
  type PlayerPosition,
} from './types.ts'
import { createCard } from './card.ts'

// ---- 创建两副牌 ----

/** 一副标准 54 张牌（不含王为 52 张） */
const STANDARD_SUITS: Suit[] = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond]
const STANDARD_RANKS: Rank[] = [
  Rank.Two,
  Rank.Three,
  Rank.Four,
  Rank.Five,
  Rank.Six,
  Rank.Seven,
  Rank.Eight,
  Rank.Nine,
  Rank.Ten,
  Rank.Jack,
  Rank.Queen,
  Rank.King,
  Rank.Ace,
]

/** 生成一副 54 张牌（52 张 + 大小王） */
function createOneDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push(createCard(suit, rank))
    }
  }
  // 大小王
  cards.push(createCard(Suit.Joker, Rank.SmallJoker))
  cards.push(createCard(Suit.Joker, Rank.BigJoker))
  return cards
}

/** 创建两副完整牌（共 108 张） */
export function createDecks(): Card[] {
  return [...createOneDeck(), ...createOneDeck()]
}

// ---- 洗牌（Fisher-Yates） ----

/**
 * Fisher-Yates 洗牌算法
 * @param cards 待洗牌的数组（会被修改）
 * @param seed 可选随机种子（用于可复现测试）
 */
export function shuffleCards(cards: Card[], seed?: number): void {
  // 如果提供种子，使用可复现的伪随机
  const rng = seed !== undefined ? seededRandom(seed) : Math.random

  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
}

/** 简单的种子随机数生成器（Mulberry32） */
function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 发牌 ----

export interface DealResult {
  /** 每个玩家的手牌 */
  hands: Record<PlayerPosition, Card[]>
  /** 底牌 */
  bottom: Card[]
}

/**
 * 发牌：每人 25 张，留 8 张底牌
 * 发牌顺序：东→南→西→北 循环
 */
export function dealCards(
  deck: Card[],
  bottomCount: number = 8,
  cardOrder?: PlayerPosition[],
): DealResult {
  const order = cardOrder ?? ALL_POSITIONS
  const hands: Record<string, Card[]> = {
    E: [],
    S: [],
    W: [],
    N: [],
  }

  const cardsPerPlayer = (deck.length - bottomCount) / 4

  let idx = 0
  // 每人 cardsPerPlayer 张
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (const pos of order) {
      hands[pos].push(deck[idx++])
    }
  }

  // 剩余为底牌
  const bottom = deck.slice(idx)

  return {
    hands: hands as Record<PlayerPosition, Card[]>,
    bottom,
  }
}

