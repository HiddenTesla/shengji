// ============================================================
// 计分（步骤 6）
//
//   分牌：5 = 5 分，10 / K = 10 分
//   收墩时，该墩分数记给「赢家所在队伍」
//   闲家得分 = 进攻方（非庄家队）赢得的墩分
//   庄家逃分 = 庄家队赢得的墩分
//
// 说明：本局在打的是 100 张（108 张减去 8 张底牌），
//       因此 闲家得分 + 庄家逃分 = 在打牌张的总分；
//       底牌分单独在步骤 7（抠底）结算。
// ============================================================

import {
  type Card,
  type PlayerPosition,
  type Rank,
  type Suit,
  type Trick,
  pointValue,
  teamOf,
} from './types.ts';
import { type Door, doorOf, maxPairRunLength } from './hand.ts';

/** 一组牌的总分（5 = 5 分，10 / K = 10 分） */
export function trickPoints(cards: Card[]): number {
  let sum = 0;
  for (const c of cards) sum += pointValue(c.rank);
  return sum;
}

/** 某方位是否为闲家（与庄家不同队） */
export function isDefender(
  pos: PlayerPosition,
  banker: PlayerPosition,
): boolean {
  return teamOf(pos) !== teamOf(banker);
}

/** 得分累计 */
export interface ScoreDelta {
  /** 闲家得分 */
  defendingPoints: number;
  /** 庄家逃分 */
  bankerPoints: number;
}

/** 把一墩的分数按赢家归属累加 */
export function accumulate(
  prev: ScoreDelta,
  winner: PlayerPosition,
  cards: Card[],
  banker: PlayerPosition,
): ScoreDelta {
  const pts = trickPoints(cards);
  if (pts === 0) return prev;
  return isDefender(winner, banker)
    ? { defendingPoints: prev.defendingPoints + pts, bankerPoints: prev.bankerPoints }
    : { defendingPoints: prev.defendingPoints, bankerPoints: prev.bankerPoints + pts };
}

// ============================================================
// 抠底（步骤 7）
//
//   最后一墩若由**闲家方**赢 → 抠底，底牌分 × 倍数 计入闲家；
//   否则底牌分不计。
//
//   倍数 = 2^(n+1)，n = 末墩「拖拉机长度」（**以领出者的牌为准**）：
//     - 无对子          → n = 0 → ×2
//     - 仅 1 个对子      → n = 1 → ×4（对子视为长度 1 的拖拉机）
//     - 有对子但不相连    → 各段长度均为 1 → 取最大 1 → ×4
//     - 长度 2 的拖拉机   → n = 2 → ×8（即使还夹着别的单对，仍取最长段）
// ============================================================

/**
 * 末墩「拖拉机长度」n：
 *   取末墩**领出者所出牌**里最长的「连续对子段」（对子视为长度 1 的拖拉机）；
 *   无对子则 n = 0。
 *
 * ⚠️ 以**领出者**的牌为准，而不是最终大出的那家：
 *   例：领出甩 ♠K♠Q（两张单张），另一家以「一对大王」毙牌大出 → 仍只按单张算，
 *       倍数 ×2（而不是按赢家的对子算 ×4）。
 *
 * 领出的牌一定同门（甩牌被拦时已由 resolveLead 换成门内的一组），
 * 按门分组只是兜底。
 */
export function bottomTractorLength(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const byDoor = new Map<Door, Card[]>();
  for (const c of cards) {
    const d = doorOf(c, trumpSuit, levelRank);
    const arr = byDoor.get(d);
    if (arr) arr.push(c);
    else byDoor.set(d, [c]);
  }
  let n = 0;
  for (const group of byDoor.values()) {
    n = Math.max(n, maxPairRunLength(group, trumpSuit, levelRank));
  }
  return n;
}

/** 抠底倍数 = 2^(n+1)：n=0 → 2，n=1 → 4，n=2 → 8，n=3 → 16 … */
export function bottomMultiplier(n: number): number {
  return 2 ** (n + 1);
}

/** 抠底结算结果 */
export interface BottomSettlement {
  /** 是否抠底（末墩由闲家赢） */
  taken: boolean;
  /** 末墩的拖拉机长度 n（按**领出者**的牌；对子记 1；无对子记 0） */
  tractorLength: number;
  /** 倍数：抠底时为 2^(n+1)，**未抠底时为 0**（不得分） */
  multiplier: number;
  /** 底牌本身的分数 */
  bottomCardPoints: number;
  /** 计入闲家的分数 = 底牌分 × 倍数（未抠底为 0） */
  points: number;
  /** 末墩赢家 */
  winner: PlayerPosition | null;
}

/**
 * 结算抠底：仅当**末墩由闲家方赢**时计分，分数 = 底牌分 × 2^(n+1)（n 见 bottomTractorLength）。
 * 否则不计分（`taken = false`、`multiplier = 0`、`points = 0`）。
 *
 * 「闲家赢」按**队伍**判定：庄家的对家与庄家同队，其大出视为庄家方大出（不抠底）；
 * 领出者是谁（庄家方 / 闲家）不影响是否抠底，只影响倍数里的牌型。
 */
export function settleBottom(
  lastTrick: Trick,
  bottomCards: Card[],
  banker: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): BottomSettlement {
  const bottomCardPoints = trickPoints(bottomCards);
  const winner = lastTrick.winner;
  const taken = winner !== null && isDefender(winner, banker);
  // 未抠底 → 0 倍、不得分（不再给出「若抠底」的假想倍数）
  // 牌型以**领出者**为准（不是最终大出的那家）
  const leadPlay = lastTrick.plays.find(p => p.player === lastTrick.leadPlayer);
  const tractorLength = taken && leadPlay
    ? bottomTractorLength(leadPlay.cards, trumpSuit, levelRank)
    : 0;
  const multiplier = taken ? bottomMultiplier(tractorLength) : 0;
  return {
    taken,
    tractorLength,
    multiplier,
    bottomCardPoints,
    points: bottomCardPoints * multiplier,
    winner,
  };
}
