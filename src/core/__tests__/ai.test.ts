// ============================================================
// AI 领出策略测试（ai.ts）
//
// 重点：「副牌有已方确定大牌时领出该门分牌」这条技巧**不能**套用到主牌。
// AI 不应该为了多收 10 分而领出主 10，让对家的大王 / 小王把这一墩接走；
// 该领小主牌吊主，把王留着抢有分的墩。
// ============================================================

import { type Card, PlayerPosition, RANK_NAME, Rank, Suit } from '../types.ts';
import { aiChoosePlay } from '../ai.ts';
import { type Hands, applyPlay, createPlayState } from '../play.ts';
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

/** 东家（第一家）领出 leadCard 之后，北家（第二家）AI 选的牌 */
function secondSeatOf(hands: Hands, leadCard: Card): string[] {
  return secondSeatAfter(hands, [leadCard]);
}

/** 东家（第一家）领出 leadCards 之后，北家（第二家）AI 选的牌 */
function secondSeatAfter(hands: Hands, leadCards: Card[]): string[] {
  const played = applyPlay(
    hands, createPlayState(PlayerPosition.East), PlayerPosition.East, leadCards, TRUMP, LEVEL,
  );
  return aiChoosePlay(played.state, played.hands, TRUMP, LEVEL).map(card =>
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

describe('AI 跟单张（第二家）：不靠对家的大主救分数', () => {
  // 东家（第一家）领出、北家（第二家）在 ♥10 / ♥9（或 ♠10 / ♠9）中二选一，
  // 西家（第三家）压回来，南家（第四家，对家）收下这一墩。
  const EAST_HEART = () => [
    c(Suit.Heart, R.Four), c(Suit.Club, R.Five), c(Suit.Diamond, R.Five),
  ];
  const NORTH_HEART = () => [
    c(Suit.Heart, R.Ten), c(Suit.Heart, R.Nine), c(Suit.Club, R.Three), c(Suit.Diamond, R.Four),
  ];
  const WEST_BEATS_CHEAP = () => [
    c(Suit.Heart, R.Ace), c(Suit.Heart, R.Three), c(Suit.Club, R.Six), c(Suit.Diamond, R.Six),
  ];
  /** 东家领手里第一张牌后，北家的选择 */
  const pick = (hands: Hands) =>
    secondSeatOf(hands, hands[PlayerPosition.East][0]);

  it('对家还有两张主、最省的赢牌也是大主 → 出 ♠9 不送 ♠10', () => {
    // 主牌领出：对家（南）手里大王 + 主级牌两张主，动哪张都会丢掉一个控制牌。
    const hands = handsOf(
      [c(Suit.Spade, R.Four), c(Suit.Club, R.Five), c(Suit.Diamond, R.Five)],
      [c(Suit.Joker, R.BigJoker), c(Suit.Spade, R.Two), c(Suit.Club, R.Seven)],
      [c(Suit.Spade, R.Ace), c(Suit.Spade, R.Three), c(Suit.Club, R.Six), c(Suit.Diamond, R.Six)],
      [c(Suit.Spade, R.Ten), c(Suit.Spade, R.Nine), c(Suit.Club, R.Three), c(Suit.Diamond, R.Four)],
    );
    expectEqual(pick(hands), ['S9'], '北家跟牌');
  });

  it('对家仅剩最后一张主且压得下下家 → 照旧送 ♥10', () => {
    // 对家（南）只剩大王这一张主，而且它压得住第三家所有的牌：
    // 这张主反正要用掉、收的是确定的一墩，多的 10 分应当照收。
    const hands = handsOf(
      EAST_HEART(),
      [c(Suit.Joker, R.BigJoker), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven)],
      WEST_BEATS_CHEAP(),
      NORTH_HEART(),
    );
    expectEqual(pick(hands), ['H10'], '北家跟牌');
  });

  it('最后一张主是级牌、同样压得下下家 → 照旧送 ♥10', () => {
    const hands = handsOf(
      EAST_HEART(),
      [c(Suit.Heart, R.Two), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven)],
      WEST_BEATS_CHEAP(),
      NORTH_HEART(),
    );
    expectEqual(pick(hands), ['H10'], '北家跟牌');
  });

  it('最后一张主压不住下家（三家有大王）→ 仍不送 ♥10', () => {
    // 对家只剩小王，但第三家断 ♥ 且手里有更大的大王：这一墩并不保证
    const hands = handsOf(
      EAST_HEART(),
      [c(Suit.Joker, R.SmallJoker), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven)],
      [c(Suit.Spade, R.Nine), c(Suit.Joker, R.BigJoker), c(Suit.Club, R.Six)],
      NORTH_HEART(),
    );
    expectEqual(pick(hands), ['H9'], '北家跟牌');
  });

  it('对家有 ♥A 能便宜收下 → 照旧出 ♥10', () => {
    const hands = handsOf(
      EAST_HEART(),
      [c(Suit.Heart, R.Ace), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven)],
      [c(Suit.Heart, R.Queen), c(Suit.Heart, R.Three), c(Suit.Club, R.Six), c(Suit.Diamond, R.Six)],
      NORTH_HEART(),
    );
    expectEqual(pick(hands), ['H10'], '北家跟牌');
  });

  it('双方都断 ♥、小主对毙（不动大主）→ 照旧出 ♥10', () => {
    const hands = handsOf(
      EAST_HEART(),
      [c(Suit.Spade, R.Jack), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven)],
      [c(Suit.Spade, R.Nine), c(Suit.Club, R.Six), c(Suit.Diamond, R.Six), c(Suit.Club, R.Eight)],
      NORTH_HEART(),
    );
    expectEqual(pick(hands), ['H10'], '北家跟牌');
  });
});

describe('AI 跟单张：一门只剩「一张 5 + 一张小牌 X」', () => {
  // 东家（对手）领 ♥A / ♥7，北家该门只剩 ♥5 与 X，必须送出去一张。
  const southNoHeart = () => [c(Suit.Club, R.Nine), c(Suit.Diamond, R.Eight), c(Suit.Club, R.Six)];
  const westNoHeart = () => [c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Eight)];
  const afterEastLead = (hands: Hands) =>
    secondSeatOf(hands, hands[PlayerPosition.East][0]);

  it('X 不是该门最大牌 → 送 X 留 5', () => {
    const hands = handsOf(
      [c(Suit.Heart, R.Ace), c(Suit.Club, R.Four), c(Suit.Diamond, R.Four)],
      southNoHeart(),
      [c(Suit.Heart, R.Jack), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Eight)],
      [c(Suit.Heart, R.Five), c(Suit.Heart, R.Nine), c(Suit.Club, R.Three), c(Suit.Diamond, R.Six)],
    );
    expectEqual(afterEastLead(hands), ['H9'], '北家跟牌');
  });

  it('X 在这墩之后是该门最大牌 → 送 5 分留下 X', () => {
    const hands = handsOf(
      [c(Suit.Heart, R.Ace), c(Suit.Club, R.Four), c(Suit.Diamond, R.Four)],
      southNoHeart(),
      westNoHeart(),
      [c(Suit.Heart, R.Five), c(Suit.Heart, R.Nine), c(Suit.Club, R.Three), c(Suit.Diamond, R.Six)],
    );
    expectEqual(afterEastLead(hands), ['H5'], '北家跟牌');
  });

  it('X 是 10 分牌时一律送 5 分（当门霸也一样）', () => {
    const bossHands = handsOf(
      [c(Suit.Heart, R.Ace), c(Suit.Club, R.Four), c(Suit.Diamond, R.Four)],
      southNoHeart(),
      westNoHeart(),
      [c(Suit.Heart, R.Five), c(Suit.Heart, R.Ten), c(Suit.Club, R.Three), c(Suit.Diamond, R.Six)],
    );
    expectEqual(afterEastLead(bossHands), ['H5'], 'X 是门霸');
    const beatenHands = handsOf(
      [c(Suit.Heart, R.Ace), c(Suit.Club, R.Four), c(Suit.Diamond, R.Four)],
      southNoHeart(),
      [c(Suit.Heart, R.Jack), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Eight)],
      [c(Suit.Heart, R.Five), c(Suit.Heart, R.Ten), c(Suit.Club, R.Three), c(Suit.Diamond, R.Six)],
    );
    expectEqual(afterEastLead(beatenHands), ['H5'], 'X 不是门霸');
  });

  it('X 能赢下这一墩 → 仍然出 X 去赢', () => {
    // 领出 ♥7：♥5 赢不了，♥9 能赢 —— 留门霸的偏好不能盖过赢墩
    const hands = handsOf(
      [c(Suit.Heart, R.Seven), c(Suit.Club, R.Four), c(Suit.Diamond, R.Four)],
      southNoHeart(),
      westNoHeart(),
      [c(Suit.Heart, R.Five), c(Suit.Heart, R.Nine), c(Suit.Club, R.Three), c(Suit.Diamond, R.Six)],
    );
    expectEqual(afterEastLead(hands), ['H9'], '北家跟牌');
  });
});

describe('AI 多张跟牌：垫牌顺序（5 的保留优先级高于 6/7/8/9/J）', () => {
  // 东家（对手）领一对 ♥A 大出，北家必须送两张 ♥ 出去。
  const filler = () => [
    c(Suit.Spade, R.Three), c(Suit.Diamond, R.Nine), c(Suit.Club, R.Nine),
  ];
  /** 领一对 ♥A 后北家的选择（结果排序后比较） */
  const followPair = (north: Card[]): string[] => {
    const east = [
      c(Suit.Heart, R.Ace), c(Suit.Heart, R.Ace),
      c(Suit.Club, R.Four), c(Suit.Diamond, R.Four),
    ];
    const hands = handsOf(east, filler(), filler(), north);
    return secondSeatAfter(
      hands, hands[PlayerPosition.East].slice(0, 2),
    ).sort();
  };

  it('手上 ♥5 6 7 8 → 送 6 和 7，把 5 留着', () => {
    expectEqual(
      followPair([
        c(Suit.Heart, R.Five), c(Suit.Heart, R.Six),
        c(Suit.Heart, R.Seven), c(Suit.Heart, R.Eight),
      ]),
      ['H6', 'H7'],
      '北家跟牌',
    );
  });

  it('手上 ♥5 6 8、♥8 是门霸 → 送 6 和 5，把门霸留着', () => {
    expectEqual(
      followPair([
        c(Suit.Heart, R.Five), c(Suit.Heart, R.Six),
        c(Suit.Heart, R.Eight), c(Suit.Diamond, R.Nine),
      ]),
      ['H5', 'H6'],
      '北家跟牌',
    );
  });

  it('手上有 ♥55 和 ♥66 → 送 ♥66，把 5 的对子留着', () => {
    expectEqual(
      followPair([
        c(Suit.Heart, R.Five), c(Suit.Heart, R.Five),
        c(Suit.Heart, R.Six), c(Suit.Heart, R.Six),
      ]),
      ['H6', 'H6'],
      '北家跟牌',
    );
  });

  it('断 ♥ 垫牌：♣5 6 7 8 里先送 ♣6 ♣7', () => {
    expectEqual(
      followPair([
        c(Suit.Club, R.Five), c(Suit.Club, R.Six),
        c(Suit.Club, R.Seven), c(Suit.Club, R.Eight),
      ]),
      ['C6', 'C7'],
      '北家跟牌',
    );
  });
});

describe('AI 多张跟牌：甩牌补牌不浪费主牌', () => {
  // 东家（对手）甩 ♥A K Q Q（4 张、含 1 对），北家必须跟 4 张。
  const filler = () => [
    c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Eight),
  ];
  const followThrow = (north: Card[]): string[] => {
    const east = [
      c(Suit.Heart, R.Ace), c(Suit.Heart, R.King),
      c(Suit.Heart, R.Queen), c(Suit.Heart, R.Queen),
    ];
    const hands = handsOf(east, filler(), filler(), north);
    return secondSeatAfter(hands, hands[PlayerPosition.East].slice(0, 4)).sort();
  };

  it('该门只剩 ♥3、其余全是主牌 → 补最便宜的主，不送一对大王', () => {
    // 补牌只是垫牌，不要求同型：不能为了「跟对子」把一对大王垫出去
    expectEqual(
      followThrow([
        c(Suit.Heart, R.Three), c(Suit.Spade, R.Three), c(Suit.Spade, R.Four),
        c(Suit.Joker, R.BigJoker), c(Suit.Joker, R.BigJoker),
      ]),
      ['H3', 'J大王', 'S3', 'S4'],
      '北家跟牌',
    );
  });

  it('断 ♥、有 ♣7 ♣8 与两张大王 → 用 ♣7 ♣8 + ♠3 + 一张大王', () => {
    expectEqual(
      followThrow([
        c(Suit.Club, R.Seven), c(Suit.Club, R.Eight), c(Suit.Spade, R.Three),
        c(Suit.Joker, R.BigJoker), c(Suit.Joker, R.BigJoker),
      ]),
      ['C7', 'C8', 'J大王', 'S3'],
      '北家跟牌',
    );
  });

  it('该门 ♥3 + 够用的副牌补牌 → 完全不动主牌', () => {
    expectEqual(
      followThrow([
        c(Suit.Heart, R.Three), c(Suit.Club, R.Seven),
        c(Suit.Club, R.Eight), c(Suit.Club, R.Nine), c(Suit.Joker, R.BigJoker),
      ]),
      ['C7', 'C8', 'C9', 'H3'],
      '北家跟牌',
    );
  });
});

describe('AI 多张跟牌：对家基本大出时垫分', () => {
  // 南（北家的对家）领 ♥A Q Q（基本大出），东家跟三张 ♥ 之后轮到北家；
  // 北家没有 ♥，要把 3 张牌送给南家。
  const eastFollow = () => [
    c(Suit.Heart, R.Three), c(Suit.Heart, R.Four), c(Suit.Heart, R.Six),
    c(Suit.Club, R.Nine), c(Suit.Diamond, R.Nine),
  ];
  const southLead = () => [
    c(Suit.Heart, R.Ace), c(Suit.Heart, R.Queen), c(Suit.Heart, R.Queen),
    c(Suit.Club, R.Four), c(Suit.Diamond, R.Four),
  ];
  /** 西家跟不上 ♥A Q Q（有 ♥ 但都比 Q 小）→ 对家确定大出 */
  const westSafe = () => [
    c(Suit.Heart, R.Seven), c(Suit.Heart, R.Eight), c(Suit.Heart, R.Nine),
    c(Suit.Diamond, R.King), c(Suit.Club, R.King),
  ];
  const northPick = (north: Card[], west: Card[]): string[] => {
    const hands = handsOf(eastFollow(), southLead(), west, north);
    const first = applyPlay(
      hands, createPlayState(PlayerPosition.South), PlayerPosition.South,
      hands[PlayerPosition.South].slice(0, 3), TRUMP, LEVEL,
    );
    const eastCards = first.hands[PlayerPosition.East]
      .filter(card => card.suit === Suit.Heart).slice(0, 3);
    const second = applyPlay(
      first.hands, first.state, PlayerPosition.East, eastCards, TRUMP, LEVEL,
    );
    return aiChoosePlay(second.state, second.hands, TRUMP, LEVEL)
      .map(card => `${card.suit}${RANK_NAME[card.rank]}`).sort();
  };

  it('北无 ♥ → 先贴单张 10，再贴 5，最后才贴杂牌', () => {
    expectEqual(
      northPick([
        c(Suit.Club, R.Ten), c(Suit.Club, R.Three), c(Suit.Diamond, R.Five),
        c(Suit.Diamond, R.Seven), c(Suit.Spade, R.Three),
      ], westSafe()),
      ['C10', 'C3', 'D5'],
      '北家跟牌',
    );
  });

  it('手上 ♣10 对、对手有更大的 ♣JJ → 死对子整对先垫', () => {
    const westWithJacks = [
      c(Suit.Club, R.Jack), c(Suit.Club, R.Jack),
      c(Suit.Heart, R.Seven), c(Suit.Diamond, R.King), c(Suit.Club, R.King),
    ];
    expectEqual(
      northPick([
        c(Suit.Club, R.Ten), c(Suit.Club, R.Ten), c(Suit.Diamond, R.Three),
        c(Suit.Diamond, R.Seven), c(Suit.Spade, R.Three),
      ], westWithJacks),
      ['C10', 'C10', 'D3'],
      '北家跟牌',
    );
  });

  it('对手可能毙（断 ♥ 且带一对主）→ 不盲目垫分', () => {
    const westCanRuff = [
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three), c(Suit.Spade, R.Four),
      c(Suit.Diamond, R.King), c(Suit.Club, R.King),
    ];
    expectEqual(
      northPick([
        c(Suit.Club, R.Ten), c(Suit.Club, R.Three), c(Suit.Diamond, R.Five),
        c(Suit.Diamond, R.Seven), c(Suit.Spade, R.Three),
      ], westCanRuff),
      ['C3', 'D5', 'D7'],
      '北家跟牌',
    );
  });
});

describe('AI 领出：大对子（AA / KK）不轻易拆', () => {
  const SIDE6 = () => [
    c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Eight),
    c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine), c(Suit.Diamond, R.Nine),
  ];

  it('♥AA：对手断 ♥ 但只有单张主 → 单 A 会被毙，应整对领出', () => {
    const hands = handsOf(
      [
        c(Suit.Heart, R.Ace), c(Suit.Heart, R.Ace), c(Suit.Club, R.Three),
        c(Suit.Diamond, R.Four), c(Suit.Club, R.Five), c(Suit.Diamond, R.Six),
      ],
      SIDE6(),
      [c(Suit.Spade, R.Three), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven),
        c(Suit.Club, R.Eight), c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine)],
      [c(Suit.Spade, R.Four), c(Suit.Diamond, R.Ten), c(Suit.Club, R.Ten),
        c(Suit.Diamond, R.Jack), c(Suit.Club, R.Jack), c(Suit.Diamond, R.Queen)],
    );
    expectEqual(leadOf(hands, PlayerPosition.East), ['HA', 'HA'], '东家领出');
  });

  it('♥AA：一张张打都能大出 → 允许拆（能赢两墩）', () => {
    const hands = handsOf(
      [
        c(Suit.Heart, R.Ace), c(Suit.Heart, R.Ace), c(Suit.Club, R.Three),
        c(Suit.Diamond, R.Four), c(Suit.Club, R.Five), c(Suit.Diamond, R.Six),
      ],
      SIDE6(), SIDE6(), SIDE6(),
    );
    expectEqual(leadOf(hands, PlayerPosition.East), ['HA'], '东家领出');
  });

  it('♥KK：对手只有单张 ♥A → 单 K 被压，应整对领出', () => {
    const hands = handsOf(
      [
        c(Suit.Heart, R.King), c(Suit.Heart, R.King), c(Suit.Club, R.Three),
        c(Suit.Diamond, R.Four), c(Suit.Club, R.Five), c(Suit.Diamond, R.Six),
      ],
      [c(Suit.Heart, R.Ace), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven),
        c(Suit.Club, R.Eight), c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine)],
      [c(Suit.Heart, R.Three), c(Suit.Diamond, R.Ten), c(Suit.Club, R.Ten),
        c(Suit.Diamond, R.Jack), c(Suit.Club, R.Jack), c(Suit.Diamond, R.Queen)],
      SIDE6(),
    );
    expectEqual(leadOf(hands, PlayerPosition.East), ['HK', 'HK'], '东家领出');
  });

  it('♥AKK：外面没有 ♥A → 领 ♥KK，不拆成单张 K', () => {
    const hands = handsOf(
      [
        c(Suit.Heart, R.Ace), c(Suit.Heart, R.King), c(Suit.Heart, R.King),
        c(Suit.Club, R.Three), c(Suit.Diamond, R.Four), c(Suit.Club, R.Five),
      ],
      [c(Suit.Heart, R.Three), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven),
        c(Suit.Club, R.Eight), c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine)],
      [c(Suit.Heart, R.Four), c(Suit.Diamond, R.Ten), c(Suit.Club, R.Ten),
        c(Suit.Diamond, R.Jack), c(Suit.Club, R.Jack), c(Suit.Diamond, R.Queen)],
      SIDE6(),
    );
    expectEqual(leadOf(hands, PlayerPosition.East), ['HK', 'HK'], '东家领出');
  });

  // ---- 一对 A：能抓住对手的对 K / 对 10 才打 ----
  const EAST_AA = () => [
    c(Suit.Heart, R.Ace), c(Suit.Heart, R.Ace), c(Suit.Club, R.Three),
    c(Suit.Diamond, R.Four), c(Suit.Club, R.Five), c(Suit.Diamond, R.Six),
  ];
  /** 对家（西）手里全是 0 分牌，加不了分 */
  const WEST_NO_POINT = () => [
    c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven), c(Suit.Club, R.Eight),
    c(Suit.Diamond, R.Eight), c(Suit.Spade, R.Three), c(Suit.Spade, R.Four),
  ];
  const SOUTH_LOW = () => [
    c(Suit.Heart, R.Five), c(Suit.Heart, R.Six), c(Suit.Club, R.Jack),
    c(Suit.Diamond, R.Jack), c(Suit.Club, R.Queen), c(Suit.Diamond, R.Queen),
  ];
  const acePairLead = (north: Card[], west: Card[]) =>
    leadOf(handsOf(EAST_AA(), SOUTH_LOW(), west, north), PlayerPosition.East);

  it('♥AA 能抓住对手的对 K（20 分）→ 整对领出', () => {
    expectEqual(
      acePairLead([
        c(Suit.Heart, R.King), c(Suit.Heart, R.King), c(Suit.Club, R.Eight),
        c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine), c(Suit.Diamond, R.Nine),
      ], WEST_NO_POINT()),
      ['HA', 'HA'],
      '东家领出',
    );
  });

  it('♥AA 能抓住对手的对 10（20 分）→ 整对领出', () => {
    expectEqual(
      acePairLead([
        c(Suit.Heart, R.Ten), c(Suit.Heart, R.Ten), c(Suit.Club, R.Eight),
        c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine), c(Suit.Diamond, R.Nine),
      ], WEST_NO_POINT()),
      ['HA', 'HA'],
      '东家领出',
    );
  });

  it('对手有对 K 但对 7 可顶替（抓不到 20 分）→ 不轻易打对 A', () => {
    expectEqual(
      acePairLead([
        c(Suit.Heart, R.King), c(Suit.Heart, R.King), c(Suit.Heart, R.Seven),
        c(Suit.Heart, R.Seven), c(Suit.Club, R.Nine), c(Suit.Diamond, R.Nine),
      ], WEST_NO_POINT()),
      ['HA'],
      '东家领出',
    );
  });

  it('对家只能加 10 分（凑不满 20 分）→ 也不轻易打对 A', () => {
    expectEqual(
      acePairLead([
        c(Suit.Heart, R.Three), c(Suit.Heart, R.Four), c(Suit.Club, R.Eight),
        c(Suit.Diamond, R.Eight), c(Suit.Club, R.Nine), c(Suit.Diamond, R.Nine),
      ], [
        c(Suit.Heart, R.King), c(Suit.Club, R.Seven), c(Suit.Diamond, R.Seven),
        c(Suit.Club, R.Eight), c(Suit.Spade, R.Three), c(Suit.Spade, R.Four),
      ]),
      ['HA'],
      '东家领出',
    );
  });
});
