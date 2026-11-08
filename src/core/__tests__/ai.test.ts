// ============================================================
// AI 领出策略测试（ai.ts）
//
// 重点：「副牌有已方确定大牌时领出该门分牌」这条技巧**不能**套用到主牌。
// AI 不应该为了多收 10 分而领出主 10，让对家的大王 / 小王把这一墩接走；
// 该领小主牌吊主，把王留着抢有分的墩。
// ============================================================

import { type Card, PlayerPosition, RANK_NAME, Rank, Suit } from '../types.ts';
import { aiChoosePlay } from '../ai.ts';
import { type Hands, createPlayState } from '../play.ts';
import { describe, expectEqual, it } from './harness.ts';

const TRUMP: Suit | null = Suit.Spade;
const LEVEL = Rank.Two;
const R = Rank;

let uid = 0;
/** 造一张牌（id 唯一即可） */
const c = (suit: Suit, rank: Rank): Card => ({
  id: `${suit}${rank}-ai#${uid++}`,
  suit,
  rank,
});

const handsOf = (
  east: Card[],
  south: Card[],
  west: Card[],
  north: Card[],
): Hands => ({
  [PlayerPosition.East]: east,
  [PlayerPosition.South]: south,
  [PlayerPosition.West]: west,
  [PlayerPosition.North]: north,
});

/** 某家领出时 AI 选的牌（简写文本，方便断言） */
function leadOf(hands: Hands, banker: PlayerPosition): string[] {
  const state = createPlayState(banker);
  return aiChoosePlay(state, hands, TRUMP, LEVEL).map(card =>
    `${card.suit}${RANK_NAME[card.rank]}`,
  );
}

describe('AI 领出：主牌不套用「已方确定大牌」技巧', () => {
  it('对家只有大王能接主牌时，领小主牌而不是主 10', () => {
    // 主 ♠、级 2：东家手里有主 10 / 主 4 和两张杂副，两张杂副都会被对手管住，
    // 对家（西）唯一的将牌是大王 —— 领主牌就会让大王接走这墩。
    // 领主 10 = 用对家的大王换 10 分，实战几乎不会这样打，应改领主 4。
    const hands = handsOf(
      [c(Suit.Spade, R.Ten), c(Suit.Spade, R.Four), c(Suit.Club, R.Three), c(Suit.Diamond, R.Four)],
      [c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven), c(Suit.Heart, R.Five)],
      [c(Suit.Joker, R.BigJoker), c(Suit.Club, R.Four), c(Suit.Diamond, R.Three), c(Suit.Heart, R.Three)],
      [c(Suit.Club, R.Six), c(Suit.Diamond, R.Six), c(Suit.Heart, R.Four)],
    );
    expectEqual(leadOf(hands, PlayerPosition.East), ['S4'], '东家领出');
  });

  it('副牌的安全 10 分牌照旧优先领出', () => {
    // ♥ 是副牌，两个对手都没有比 ♥10 更大的 ♥、也没有断门带主，
    // 领 ♥10 稳收 10 分 —— 这条技巧只对副牌生效，不受主牌惩罚影响。
    const hands = handsOf(
      [c(Suit.Heart, R.Ten), c(Suit.Diamond, R.Three), c(Suit.Club, R.Four)],
      [c(Suit.Heart, R.Three), c(Suit.Diamond, R.Five), c(Suit.Club, R.Seven)],
      [c(Suit.Heart, R.Five), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Six)],
      [c(Suit.Heart, R.Four), c(Suit.Diamond, R.Six), c(Suit.Club, R.Five)],
    );
    expectEqual(leadOf(hands, PlayerPosition.East), ['H10'], '东家领出');
  });
});
