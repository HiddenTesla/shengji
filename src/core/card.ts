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
 *   1. 主牌全部排在最前（大王 > 小王 > 主级牌 > 副级牌 > 主花色其他）
 *   2. 副牌按花色分组（♠ > ♥ > ♣ > ♦）
 *   3. 每组内按点数降序
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
 *   1. 主牌性（大王 > 小王 > 主花色级牌 > 副花色级牌 > 主花色非级牌 > 副牌）
 *   2. 同组内按点数降序
 *   3. 同点数按花色顺序
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
  if (a.rank !== b.rank) return b.rank - a.rank
  // 同点数：按花色顺序
  return (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99)
}

/**
 * 获取卡牌在升级显示中的分组权重（越小越靠前）
 *
 * 有主（trumpSuit !== null）：
 *   0 = 大王
 *   1 = 小王
 *   2 = 级牌（主花色）
 *   3 = 级牌（副花色）
 *   4 = 主花色（非级牌）
 *   100+ = 副牌（按花色排序）
 *
 * 无主 / 尚未定主（trumpSuit === null）：
 *   0 = 大王
 *   1 = 小王
 *   3 = 级牌（全部同级）
 *   100+ = 副牌（按花色排序）
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
  // 无主 / 未定主：级牌均为同级主牌
  if (isLevel && trumpSuit === null) return 3
  // 主级牌（主花色的级牌）
  if (isLevel && isTrumpSuit) return 2
  // 副级牌（其余花色的级牌）—— 大于主花色普通牌
  if (isLevel) return 3
  // 主花色非级牌
  if (isTrumpSuit) return 4
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
 * 将手牌按升级规则分组（主牌 + 各副牌花色）
 *
 * - 主牌：大小王 + 全部级牌（无论花色，级牌永远算主牌） + 主花色（有主时）
 * - 副牌：其余按 ♠ > ♥ > ♣ > ♦ 分组
 *
 * 发牌 / 尚未定主（trumpSuit === null）时，级牌同样归入主牌组。
 */
export function groupCardsForDisplay(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): CardGroup[] {
  const sorted = sortCards(cards, trumpSuit, levelRank)
  const suitOrder = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond]

  // 主牌：王 + 全部级牌 + 主花色
  const trumpCards = sorted.filter(c =>
    c.suit === Suit.Joker
    || c.rank === levelRank
    || (trumpSuit !== null && c.suit === trumpSuit),
  )

  const groups: CardGroup[] = []
  if (trumpCards.length > 0) {
    groups.push({ label: '主牌', kind: 'trump', cards: trumpCards })
  }
  for (const suit of suitOrder) {
    const sc = sorted.filter(c => c.suit === suit && !trumpCards.includes(c))
    if (sc.length > 0) {
      groups.push({ label: SUIT_SYMBOL[suit], kind: suit, cards: sc })
    }
  }
  return groups
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

