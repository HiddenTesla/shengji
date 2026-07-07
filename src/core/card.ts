// ============================================================
// 卡牌定义与比较
// ============================================================

import {
  type Card,
  type CardId,
  Suit,
  Rank,
  RANK_NAME,
  SUIT_SYMBOL,
  SUIT_NAME_ZH,
} from './types.ts'

// ---- 工厂函数 ----

let _idCounter = 0

/** 创建一张牌（自动分配唯一 ID） */
export function createCard(suit: Suit, rank: Rank): Card {
  const id = `${suit}-${rank}-${_idCounter++}` as CardId
  return { id, suit, rank }
}

/** 重置 ID 计数器（仅用于测试） */
export function resetCardIdCounter(): void {
  _idCounter = 0
}

// ---- 显示 ----

/** 卡牌的显示文本，如 "♠A"、"♥10"、"🃏小王" */
export function cardDisplayName(card: Card): string {
  if (card.suit === Suit.Joker) {
    return RANK_NAME[card.rank]
  }
  return `${SUIT_SYMBOL[card.suit]}${RANK_NAME[card.rank]}`
}

/** 卡牌的简要标识，如 "SA"、"H10" */
export function cardShortName(card: Card): string {
  if (card.suit === Suit.Joker) {
    return `J-${RANK_NAME[card.rank]}`
  }
  return `${card.suit}${RANK_NAME[card.rank]}`
}

// ---- 排序（升级规则） ----

/**
 * 花色显示顺序（♠ > ♥ > ♣ > ♦ > Joker）
 */
const SUIT_ORDER: Record<Suit, number> = {
  [Suit.Spade]: 0,
  [Suit.Heart]: 1,
  [Suit.Club]: 2,
  [Suit.Diamond]: 3,
  [Suit.Joker]: 4,
}

/**
 * 升级手牌排序 —— 适用于 UI 展示
 *
 * 排序规则：
 *   1. 主牌全部排在最前（大王 > 小王 > 级牌主花 > 主花色其他）
 *   2. 副牌按花色分组（♠ > ♥ > ♣ > ♦）
 *   3. 每组内按点数降序（级牌始终排在该组最前）
 */
export function sortCards(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  return [...cards].sort((a, b) => {
    return compareForDisplay(a, b, trumpSuit, levelRank)
  })
}

/**
 * 升级专用比较函数 —— 用于手牌显示排序
 *
 * 优先级：
 *   1. 主牌性（大王 > 小王 > 主花色级牌 > 主花色非级牌 > 副花色级牌 > 副牌）
 *   2. 同组内按点数降序
 *   3. 副牌按花色顺序
 */
function compareForDisplay(
  a: Card,
  b: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const ag = getDisplayGroup(a, trumpSuit, levelRank)
  const bg = getDisplayGroup(b, trumpSuit, levelRank)

  if (ag !== bg) return ag - bg
  // 同组内：点数降序
  return b.rank - a.rank
}

/**
 * 获取卡牌在升级显示中的分组权重（越小越靠前）
 *
 * 分组：
 *   0 = 大王
 *   1 = 小王
 *   2 = 级牌（主花色）
 *   3 = 主花色（非级牌）
 *   4 = 级牌（副花色）
 *   5 = 副牌（按花色排序 offset 100）
 */
function getDisplayGroup(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const isJoker = card.suit === Suit.Joker
  const isLevel = card.rank === levelRank
  const isTrumpSuit = card.suit === trumpSuit

  if (isJoker && card.rank === Rank.BigJoker) return 0
  if (isJoker && card.rank === Rank.SmallJoker) return 1
  if (isLevel && isTrumpSuit) return 2
  if (isTrumpSuit) return 3
  if (isLevel && trumpSuit !== null) return 4
  // 副牌：花色序号 × 100 确保按花色分组
  return 100 + (SUIT_ORDER[card.suit] ?? 99) * 10
}

/** 升级手牌分组结果 */
export interface CardGroup {
  label: string
  /** 'trump' 表示主牌组，其他为花色 */
  kind: Suit | 'trump'
  cards: Card[]
}

/**
 * 将手牌按升级规则分为 4 门（主牌 + 3 副牌花色）
 *
 * - 有主时：主牌（大小王 + 级牌 + 主花色） + 其余 3 个花色 = 4 组
 * - 无主时：4 个花色各为一组（级牌归入各自花色，王归入 ♠ 组）
 */
export function groupCardsForDisplay(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): CardGroup[] {
  const sorted = sortCards(cards, trumpSuit, levelRank)
  const suitOrder = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond]

  if (trumpSuit !== null) {
    // ---- 有主：主牌 + 3 副牌花色 ----
    const groups: CardGroup[] = []
    const trumpCards = sorted.filter(c =>
      c.suit === Suit.Joker
      || c.suit === trumpSuit
      || c.rank === levelRank,
    )
    if (trumpCards.length > 0) {
      groups.push({ label: '主牌', kind: 'trump', cards: trumpCards })
    }
    for (const suit of suitOrder) {
      if (suit === trumpSuit) continue
      const sc = sorted.filter(c => c.suit === suit && !trumpCards.includes(c))
      if (sc.length > 0) {
        groups.push({ label: SUIT_SYMBOL[suit], kind: suit, cards: sc })
      }
    }
    return groups
  }
  else {
    // ---- 无主：4 门花色（王归入 ♠，级牌归入各自花色） ----
    const groups: CardGroup[] = []
    const jokers = sorted.filter(c => c.suit === Suit.Joker)
    const rest = sorted.filter(c => c.suit !== Suit.Joker)

    for (const suit of suitOrder) {
      let sc: Card[]
      if (suit === Suit.Spade) {
        sc = [...jokers, ...rest.filter(c => c.suit === suit)]
      }
      else {
        sc = rest.filter(c => c.suit === suit)
      }
      if (sc.length > 0) {
        groups.push({ label: SUIT_SYMBOL[suit], kind: suit, cards: sc })
      }
    }
    return groups
  }
}

/** 判断两张牌是否点数相同（用于检测对子） */
export function sameRank(a: Card, b: Card): boolean {
  return a.rank === b.rank
}

/** 判断两张牌是否同花色 */
export function sameSuit(a: Card, b: Card): boolean {
  return a.suit === b.suit
}

/** 判断一张牌是否为主牌 */
export function isTrumpCard(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (card.suit === Suit.Joker) return true
  if (card.rank === levelRank) return true
  if (card.suit === trumpSuit) return true
  return false
}

