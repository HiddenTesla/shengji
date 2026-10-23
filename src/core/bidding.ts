// ============================================================
// 叫主（亮主 / 反主 / 无主）
// ============================================================

import {
  type Card,
  type CardId,
  type PlayerPosition,
  type RuleOptions,
  Suit,
  Rank,
  SUIT_SYMBOL,
  DEFAULT_RULE_OPTIONS,
} from './types.ts';
import { evaluateTrumpStrength } from './trump.ts';

/**
 * 叫主强度（越大越强）
 *   Single         单张级牌亮主
 *   Pair           一对级牌反主
 *   SmallJokerPair 一对小王 → 无主
 *   BigJokerPair   一对大王 → 无主（报品高于对小王）
 */
export enum BidStrength {
  Single = 1,
  Pair = 2,
  SmallJokerPair = 3,
  BigJokerPair = 4,
}

/** 一次叫主声明 */
export interface Declaration {
  player: PlayerPosition;
  /** 主花色；null 表示无主 */
  suit: Suit | null;
  strength: BidStrength;
  /** 用于亮主的牌 ID */
  cardIds: CardId[];
}

/** 叫主回合状态 */
export interface BidState {
  /** 当前最高声明（null = 尚无人叫主） */
  current: Declaration | null;
  /** 自上次声明后的连续过牌数 */
  passes: number;
  /** 当前轮到 ALL_POSITIONS 中的索引 */
  turnIndex: number;
  /** 全部声明记录 */
  history: Declaration[];
}

/** 初始叫主状态 */
export function createBidState(firstTurnIndex = 0): BidState {
  return {
    current: null,
    passes: 0,
    turnIndex: firstTurnIndex,
    history: [],
  };
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
 *   - 持有两张同大小的王（对小王 / 对大王）→ 可"无主"
 */
export function getPossibleDeclarations(
  hand: Card[],
  levelRank: Rank,
  player: PlayerPosition,
): Declaration[] {
  const decls: Declaration[] = [];

  // 按花色归集级牌
  const levelBySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    if (c.rank === levelRank && c.suit !== Suit.Joker) {
      const arr = levelBySuit.get(c.suit) ?? [];
      arr.push(c);
      levelBySuit.set(c.suit, arr);
    }
  }
  for (const [suit, cards] of levelBySuit) {
    // 单张亮主
    decls.push({
      player,
      suit,
      strength: BidStrength.Single,
      cardIds: [cards[0].id],
    });
    // 对子反主
    if (cards.length >= 2) {
      decls.push({
        player,
        suit,
        strength: BidStrength.Pair,
        cardIds: [cards[0].id, cards[1].id],
      });
    }
  }

  // 对王 → 无主（必须同大小；大对 > 小对；单大王+单小王不能报）
  const smallJokers = hand.filter(
    c => c.suit === Suit.Joker && c.rank === Rank.SmallJoker,
  );
  if (smallJokers.length >= 2) {
    decls.push({
      player,
      suit: null,
      strength: BidStrength.SmallJokerPair,
      cardIds: [smallJokers[0].id, smallJokers[1].id],
    });
  }
  const bigJokers = hand.filter(
    c => c.suit === Suit.Joker && c.rank === Rank.BigJoker,
  );
  if (bigJokers.length >= 2) {
    decls.push({
      player,
      suit: null,
      strength: BidStrength.BigJokerPair,
      cardIds: [bigJokers[0].id, bigJokers[1].id],
    });
  }

  return decls;
}

/**
 * 自己压自己的情形是否属于「反自己亮的主」。
 *
 * - 自保：同一报品内的补强（有主花色下「单张 → 对子」）——不算自反；
 * - 无主的「对小王」与「对大王」是**两种不同报品**，互相覆盖属于自反；
 * - 换成别的主门 / 有主与无主互换，同样属于自反。
 */
export function isSelfOverride(decl: Declaration, current: Declaration): boolean {
  if (decl.player !== current.player) return false;
  // 无主只有两档报品，且互不相同；能覆盖时必然是换档
  if (decl.suit === null) return true;
  return decl.suit !== current.suit;
}

/** 新声明能否覆盖当前声明（无当前声明时总是可以） */
export function canOverride(
  next: Declaration,
  current: Declaration | null,
  rules: RuleOptions = DEFAULT_RULE_OPTIONS,
): boolean {
  if (!current) return true;
  if (next.strength <= current.strength) return false;
  if (next.player !== current.player) return true;
  // 同一报品补强（自保）允许；换门 / 改无主属「反自己」，由规则控制
  if (!isSelfOverride(next, current)) return true;
  return rules.allowSelfOverride;
}

/** 声明的中文标签，如 "亮主 ♠"、"反主 ♥"、"无主" */
export function declarationLabel(d: Declaration): string {
  if (d.suit === null) {
    return d.strength === BidStrength.BigJokerPair ? '无主（大王）' : '无主（小王）';
  }
  const sym = SUIT_SYMBOL[d.suit];
  return d.strength === BidStrength.Pair ? `反主 ${sym}` : `亮主 ${sym}`;
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
  rules: RuleOptions = DEFAULT_RULE_OPTIONS,
): Declaration | null {
  const options = getPossibleDeclarations(hand, levelRank, player)
    .filter(d => canOverride(d, current, rules));

  if (options.length === 0) return null;

  let best: Declaration | null = null;
  let bestScore = -Infinity;

  for (const d of options) {
    let score: number;
    if (d.suit === null) {
      // 无主：依赖手中的王和级牌数量（对大王略优于对小王）
      const jokers = hand.filter(c => c.suit === Suit.Joker).length;
      const levels = hand.filter(c => c.rank === levelRank).length;
      score = 60 + jokers * 20 + levels * 10;
      if (d.strength === BidStrength.BigJokerPair) score += 10;
    }
    else {
      const info = evaluateTrumpStrength(hand, d.suit as Suit, levelRank);
      score = info.score;
      if (d.strength === BidStrength.Pair) score += 25;
    }

    // 抢庄优势
    if (current === null) score += 45;

    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }

  const threshold = current === null ? 110 : 150;
  return bestScore >= threshold ? best : null;
}

/**
 * 声明的强度评分（用于多个 AI 竞争同一主牌时比较优劣）
 */
export function declarationScore(
  hand: Card[],
  decl: Declaration,
  levelRank: Rank,
): number {
  if (decl.suit === null) {
    const jokers = hand.filter(c => c.suit === Suit.Joker).length;
    const levels = hand.filter(c => c.rank === levelRank).length;
    return 60 + jokers * 20 + levels * 10 + decl.strength * 30;
  }
  const info = evaluateTrumpStrength(hand, decl.suit as Suit, levelRank);
  return info.score + decl.strength * 30;
}

// ------------------------------------------------------------
// 无人报主 → 翻底牌定主
// ------------------------------------------------------------

/**
 * 无人报主时，按底牌确定主牌
 *
 * 规则（依底牌顺序）：
 *   1. 遇到级牌 → 其花色为主
 *   2. 遇到王   → 无主（NO_TRUMP）
 *   3. 底牌中既无级牌也无王 → 取点数最大那张（同点取第一张）的花色
 *
 * 以此法定主后，不可再反主。
 */
export function determineTrumpFromBottom(
  bottom: Card[],
  levelRank: Rank,
): Suit | null {
  for (const card of bottom) {
    if (card.rank === levelRank) return card.suit;
    if (card.suit === Suit.Joker) return null;
  }

  let best: Card | null = null;
  for (const card of bottom) {
    if (best === null || card.rank > best.rank) best = card;
  }
  return best ? best.suit : null;
}

/**
 * 翻底牌时的"决定性"索引：底牌中第一张级牌或王所在的下标；
 * 若整副底牌都没有级牌/王，返回 -1（此时需翻完全部，取最大点数）。
 */
export function decisiveBottomIndex(bottom: Card[], levelRank: Rank): number {
  for (let i = 0; i < bottom.length; i++) {
    const card = bottom[i];
    if (card.rank === levelRank) return i;
    if (card.suit === Suit.Joker) return i;
  }
  return -1;
}
