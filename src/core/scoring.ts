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
  pointValue,
  teamOf,
} from './types.ts'

/** 一组牌的总分（5 = 5 分，10 / K = 10 分） */
export function trickPoints(cards: Card[]): number {
  let sum = 0
  for (const c of cards) sum += pointValue(c.rank)
  return sum
}

/** 某方位是否为闲家（与庄家不同队） */
export function isDefender(
  pos: PlayerPosition,
  banker: PlayerPosition,
): boolean {
  return teamOf(pos) !== teamOf(banker)
}

/** 得分累计 */
export interface ScoreDelta {
  /** 闲家得分 */
  defendingPoints: number
  /** 庄家逃分 */
  bankerPoints: number
}

/** 把一墩的分数按赢家归属累加 */
export function accumulate(
  prev: ScoreDelta,
  winner: PlayerPosition,
  cards: Card[],
  banker: PlayerPosition,
): ScoreDelta {
  const pts = trickPoints(cards)
  if (pts === 0) return prev
  return isDefender(winner, banker)
    ? { defendingPoints: prev.defendingPoints + pts, bankerPoints: prev.bankerPoints }
    : { defendingPoints: prev.defendingPoints, bankerPoints: prev.bankerPoints + pts }
}
