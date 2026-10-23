// ============================================================
// 埋底（庄家扣底）
// ============================================================

import {
  type Card,
  Suit,
  Rank,
  isPointCard,
  pointValue,
} from './types.ts';
import { isTrump } from './trump.ts';
import { doorOf, slotOf } from './hand.ts';

/** 统计一组牌的分数（5=5 分，10/K=10 分） */
export function countPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + pointValue(c.rank), 0);
}

/**
 * 埋底分风格：-2 最保守 … +2 最激进。
 * 只影响「愿意把多少分埋进底牌」，不改变其他规则。
 */
export type BuryStyle = -2 | -1 | 0 | 1 | 2

export const BURY_STYLE_NAMES: Record<BuryStyle, string> = {
  [-2]: '最保守',
  [-1]: '较保守',
  [0]: '正常',
  [1]: '较激进',
  [2]: '最激进',
};

/** 托管埋底上下文 */
export interface BuryContext {
  /** 对家手牌（用于判断「己方大出」的牌；不传则只按自己手牌保守估计） */
  partnerHand?: Card[];
}

// ============================================================
// AI 埋底
// ============================================================

/** 每档风格调整的容分（点） */
const STYLE_POINT_TOLERANCE = 4;
/** 主牌 / 确定大牌的保护值：正常排序下不会被选中 */
const SAFE_BURY_LIMIT = 10000;
/** 己方确定大的副牌保护值 */
const BIG_SIDE_VALUE = 600;
/** 每 1 分的埋底风险值 */
const POINT_BURY_VALUE = 8;
const PAIR_STRUCTURE_VALUE = 10;
const TRACTOR_STRUCTURE_VALUE = 20;
/** 灭门基础收益 + 每点牌力收益 */
const VOID_BONUS_BASE = 120;
const VOID_BONUS_PER_STRENGTH = 2;
/** 超过容分后，每超 1 分的额外惩罚 */
const OVER_TOLERANCE_PENALTY = 100;
/** 两副牌：同花色同点数共 2 张 */
const COPIES_PER_RANK = 2;

interface BuryPairUnit {
  slot: number;
  cards: Card[];
}

/** 同门内按「同花色+点数」拆对子单元 */
function pairUnits(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): BuryPairUnit[] {
  const byKey = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.suit}|${card.rank}`;
    const arr = byKey.get(key) ?? [];
    arr.push(card);
    byKey.set(key, arr);
  }
  const units: BuryPairUnit[] = [];
  for (const arr of byKey.values()) {
    if (arr.length >= 2) {
      units.push({
        slot: slotOf(arr[0], trumpSuit, levelRank),
        cards: arr.slice(0, 2),
      });
    }
  }
  return units;
}

/** 一张牌拆对 / 拆拖拉机的结构价值（越高越不该埋） */
function structureValue(
  card: Card,
  hand: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const door = doorOf(card, trumpSuit, levelRank);
  const doorCards = hand.filter(
    c => doorOf(c, trumpSuit, levelRank) === door,
  );
  const units = pairUnits(doorCards, trumpSuit, levelRank);
  const unit = units.find(u => u.cards.some(c => c.id === card.id));
  if (!unit) return 0;

  const slots = new Set(units.map(u => u.slot));
  const inTractor = slots.has(unit.slot - 1) || slots.has(unit.slot + 1);
  return inTractor ? TRACTOR_STRUCTURE_VALUE : PAIR_STRUCTURE_VALUE;
}

const SIDE_RANKS: readonly Rank[] = [
  Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven,
  Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King,
  Rank.Ace,
];

/**
 * 副牌是否「确定大」：所有比它大的同门牌都在己方手里。
 * 两副牌每个花色+点数有 2 张，因此只需检查高牌的两张是否都在己方。
 * 己方 = 庄家手牌 + 对家手牌。
 */
function isBigSideCard(
  card: Card,
  ourSideCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (isTrump(card, trumpSuit, levelRank)) return false;

  for (const rank of SIDE_RANKS) {
    if (rank <= card.rank) continue;
    if (rank === levelRank) continue;
    const copies = ourSideCards.filter(
      c => c.suit === card.suit && c.rank === rank,
    ).length;
    if (copies < COPIES_PER_RANK) return false;
  }
  return true;
}

/** 庄家手牌 + 对家手牌的粗略牌力，用于决定能容忍多少底分 */
function handStrength(
  hand: Card[],
  partnerHand: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const ourSide = [...hand, ...partnerHand];
  const trumps = hand.filter(c => isTrump(c, trumpSuit, levelRank));
  const jokers = trumps.filter(c => c.suit === Suit.Joker);
  const levels = trumps.filter(c => c.rank === levelRank);
  const trumpPairs = pairUnits(trumps, trumpSuit, levelRank).length;

  const sideSuits = new Set<Suit>();
  for (const card of hand) {
    const door = doorOf(card, trumpSuit, levelRank);
    if (door !== 'trump') sideSuits.add(door);
  }
  let sidePairs = 0;
  for (const suit of sideSuits) {
    const suitCards = hand.filter(
      c => doorOf(c, trumpSuit, levelRank) === suit,
    );
    sidePairs += pairUnits(suitCards, trumpSuit, levelRank).length;
  }

  const bankerBig = hand.filter(
    c => !isTrump(c, trumpSuit, levelRank)
      && isBigSideCard(c, ourSide, trumpSuit, levelRank),
  ).length;
  const partnerBig = partnerHand.filter(
    c => !isTrump(c, trumpSuit, levelRank)
      && isBigSideCard(c, ourSide, trumpSuit, levelRank),
  ).length;

  return trumps.length * 4
    + jokers.length * 12
    + levels.length * 6
    + trumpPairs * 8
    + bankerBig * 6
    + partnerBig * 3
    + sidePairs * 2;
}

/** 由牌力和风格决定的「可容忍底分」 */
function pointTolerance(strength: number, style: BuryStyle): number {
  const base = Math.max(0, Math.floor((strength - 50) / 10));
  return Math.max(0, base + style * STYLE_POINT_TOLERANCE);
}

/** 单张牌的埋底代价：越低越容易成为埋底候选 */
function buryValue(
  card: Card,
  hand: Card[],
  ourSideCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
  includeStructure: boolean,
): number {
  if (isTrump(card, trumpSuit, levelRank)) {
    // 被迫埋主牌时，优先埋最小的主牌
    return SAFE_BURY_LIMIT + slotOf(card, trumpSuit, levelRank);
  }

  let value = card.rank * 3;
  if (isBigSideCard(card, ourSideCards, trumpSuit, levelRank)) {
    value += BIG_SIDE_VALUE;
  }
  if (isPointCard(card.rank)) {
    value += pointValue(card.rank) * POINT_BURY_VALUE;
  }
  if (includeStructure) {
    value += structureValue(card, hand, trumpSuit, levelRank);
  }
  return value;
}

/** 从一组牌里取代价最低的 n 张 */
function pickCheapest(
  cards: Card[],
  n: number,
  hand: Card[],
  ourSideCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
  includeStructure: boolean,
): Card[] {
  return [...cards]
    .sort((a, b) =>
      buryValue(a, hand, ourSideCards, trumpSuit, levelRank, includeStructure)
      - buryValue(b, hand, ourSideCards, trumpSuit, levelRank, includeStructure),
    )
    .slice(0, n);
}

function sideSuitsOf(
  hand: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Suit[] {
  const suits = new Set<Suit>();
  for (const card of hand) {
    const door = doorOf(card, trumpSuit, levelRank);
    if (door !== 'trump') suits.add(door);
  }
  return [...suits];
}

/** 某方案是否把某一门完全埋掉（已经灭门） */
function fullyVoidedSuits(
  hand: Card[],
  buried: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Suit[] {
  const ids = new Set(buried.map(c => c.id));
  return sideSuitsOf(hand, trumpSuit, levelRank).filter(suit => {
    const suitCards = hand.filter(
      c => doorOf(c, trumpSuit, levelRank) === suit,
    );
    return suitCards.length > 0 && suitCards.every(c => ids.has(c.id));
  });
}

/** 方案评分：埋牌代价 + 超容分惩罚 - 灭门收益 */
function planCost(
  cards: Card[],
  voidSuit: Suit | null,
  strength: number,
  tolerance: number,
  hand: Card[],
  ourSideCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  let value = 0;
  for (const card of cards) {
    const inVoidSuit = voidSuit !== null
      && doorOf(card, trumpSuit, levelRank) === voidSuit;
    value += buryValue(
      card, hand, ourSideCards, trumpSuit, levelRank, !inVoidSuit,
    );
  }

  const points = countPoints(cards);
  const over = Math.max(0, points - tolerance);
  const voidBonus = voidSuit
    ? VOID_BONUS_BASE + Math.max(0, strength - 60) * VOID_BONUS_PER_STRENGTH
    : 0;
  return value + over * OVER_TOLERANCE_PENALTY - voidBonus;
}

interface BuryPlan {
  cards: Card[];
  voidSuit: Suit | null;
  cost: number;
}

/**
 * AI 选择要埋的牌。
 *
 * 策略：
 *   1. 牌力足够时尝试「灭一门」：整门埋掉，之后可以用主牌毙；
 *   2. 不埋主牌、不埋己方确定大的副牌（A、AAK 中的 K 等），
 *      对家手牌参与「确定大」判断；
 *   3. 灭门需要埋分时，由牌力 + 风格决定容分：
 *      牌力越强、风格越激进，越能容忍底分。
 */
export function aiChooseBury(
  hand: Card[],
  count: number,
  trumpSuit: Suit | null,
  levelRank: Rank,
  style: BuryStyle = 0,
  context: BuryContext = {},
): Card[] {
  if (count <= 0) return [];

  const partnerHand = context.partnerHand ?? [];
  const ourSideCards = [...hand, ...partnerHand];
  const strength = handStrength(hand, partnerHand, trumpSuit, levelRank);
  const tolerance = pointTolerance(strength, style);
  const plans: BuryPlan[] = [];

  // 方案 A：不主动灭门，埋代价最低的 count 张（可能顺带灭掉短门）
  const safeCards = pickCheapest(
    hand, count, hand, ourSideCards, trumpSuit, levelRank, true,
  );
  const safeVoidSuit = fullyVoidedSuits(
    hand, safeCards, trumpSuit, levelRank,
  )[0] ?? null;
  plans.push({
    cards: safeCards,
    voidSuit: safeVoidSuit,
    cost: planCost(
      safeCards, safeVoidSuit, strength, tolerance,
      hand, ourSideCards, trumpSuit, levelRank,
    ),
  });

  // 方案 B：尝试整门埋掉每一个副牌门
  for (const suit of sideSuitsOf(hand, trumpSuit, levelRank)) {
    const suitCards = hand.filter(
      c => doorOf(c, trumpSuit, levelRank) === suit,
    );
    if (suitCards.length === 0 || suitCards.length > count) continue;

    const remaining = hand.filter(
      c => doorOf(c, trumpSuit, levelRank) !== suit,
    );
    const filler = pickCheapest(
      remaining, count - suitCards.length,
      hand, ourSideCards, trumpSuit, levelRank, true,
    );
    const cards = [...suitCards, ...filler];
    plans.push({
      cards,
      voidSuit: suit,
      cost: planCost(
        cards, suit, strength, tolerance,
        hand, ourSideCards, trumpSuit, levelRank,
      ),
    });
  }

  plans.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return (a.voidSuit ? 0 : 1) - (b.voidSuit ? 0 : 1);
  });
  return plans[0].cards;
}

/** 校验埋底是否合法：张数正确，且都来自手牌 */
export function isValidBury(
  hand: Card[],
  buried: Card[],
  count: number,
): boolean {
  if (buried.length !== count) return false;
  const ids = new Set(hand.map(c => c.id));
  return buried.every(c => ids.has(c.id));
}
