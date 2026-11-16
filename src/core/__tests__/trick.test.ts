// ============================================================
// 墩比较规则测试（trick.ts / hand.ts::analyzeShape）
// 重点：领出甩牌含对子 / 拖拉机时，毙牌必须「带够对子 + 不短于领出的拖拉机」，
//      否则只算垫牌；纯对子 / 纯拖拉机 / 单张领出的既有行为不变。
// ============================================================

import {
  type Card,
  HandType,
  PlayerPosition,
  Rank,
  Suit,
} from '../types.ts';
import { analyzeShape } from '../hand.ts';
import { beats, canCompete, judgePlays } from '../trick.ts';
import { describe, expectEqual, expectTrue, it } from './harness.ts';

const TRUMP: Suit | null = Suit.Spade;
const LEVEL = Rank.Two;
const R = Rank;

let uid = 0;
/** 造一张牌（id 唯一即可，不影响规则判定） */
const c = (suit: Suit, rank: Rank): Card => ({
  id: `${suit}${rank}#${uid++}`,
  suit,
  rank,
});

const shapeOf = (cards: Card[]) => analyzeShape(cards, TRUMP, LEVEL);
const canBeat = (candidate: Card[], best: Card[], trumpSuit: Suit | null = TRUMP) =>
  beats(candidate, best, shapeOf(best), trumpSuit, LEVEL);

// ------------------------------------------------------------

describe('analyzeShape：甩牌里的拖拉机也要识别', () => {
  it('AK55 = 甩牌，1 个对子，无拖拉机', () => {
    const s = shapeOf([
      c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King),
      c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    ]);
    expectEqual([s.type, s.pairs, s.tractor, s.maxTractor], [HandType.Throw, 1, 0, 0]);
  });

  it('4455AK = 甩牌，2 个对子，最长拖拉机 2 对', () => {
    const s = shapeOf([
      c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
      c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
      c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King),
    ]);
    expectEqual([s.type, s.pairs, s.tractor, s.maxTractor], [HandType.Throw, 2, 0, 2]);
  });

  it('4455 = 整手拖拉机（tractor 与 maxTractor 都是 2）', () => {
    const s = shapeOf([
      c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
      c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    ]);
    expectEqual([s.type, s.tractor, s.maxTractor], [HandType.Tractor, 2, 2]);
  });
});

describe('甩牌含对子：毙牌必须带够对子', () => {
  const lead = [
    c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
  ];

  it('4 张散主牌（无对子）→ 不能毙，只能算垫牌', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Four),
      c(Suit.Spade, R.Six), c(Suit.Spade, R.Seven),
    ], lead), false);
  });

  it('4 张主牌带 1 对 → 可以毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Six), c(Suit.Spade, R.Seven),
    ], lead), true);
  });

  it('4 张主牌带 2 对（不相连）→ 可以毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Six), c(Suit.Spade, R.Six),
    ], lead), true);
  });
});

describe('甩牌含拖拉机：毙牌的拖拉机不能比领出短', () => {
  const lead = [
    c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King),
  ];

  it('带 2 连对（对子够、拖拉机够）→ 可以毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
      c(Suit.Spade, R.Nine), c(Suit.Spade, R.Ten),
    ], lead), true);
  });

  it('3 个对子但都不相连（拖拉机不够长）→ 不能毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Nine), c(Suit.Spade, R.Nine),
      c(Suit.Spade, R.Jack), c(Suit.Spade, R.Queen),
    ], lead), false);
  });

  it('3 连对（比要求更长）→ 可以毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
      c(Suit.Spade, R.Five), c(Suit.Spade, R.Five),
    ], lead), true);
  });

  it('两张结构合规的毙牌之间：点数大的盖毙', () => {
    const best = [
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
      c(Suit.Spade, R.Seven), c(Suit.Spade, R.Eight),
    ];
    const higher = [
      c(Suit.Spade, R.Nine), c(Suit.Spade, R.Nine),
      c(Suit.Spade, R.Ten), c(Suit.Spade, R.Ten),
      c(Suit.Spade, R.Jack), c(Suit.Spade, R.Queen),
    ];
    expectEqual(beats(higher, best, shapeOf(lead), TRUMP, LEVEL), true);
  });
});

describe('拖拉机领出（既有行为不变）', () => {
  const lead = [
    c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
  ];

  it('同长主牌拖拉机 → 可以毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
    ], lead), true);
  });

  it('主牌 1 对 + 2 张散牌 → 不能毙', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Nine), c(Suit.Spade, R.Jack),
    ], lead), false);
  });
});

describe('对子领出（既有行为不变）', () => {
  const lead = [c(Suit.Diamond, R.Seven), c(Suit.Diamond, R.Seven)];

  it('主牌对子 → 可以毙', () => {
    expectEqual(canBeat([c(Suit.Spade, R.Three), c(Suit.Spade, R.Three)], lead), true);
  });

  it('两张主牌但不是对子 → 不能毙', () => {
    expectEqual(canBeat([c(Suit.Spade, R.Three), c(Suit.Spade, R.Four)], lead), false);
  });
});

describe('无对甩牌 / 同门跟牌（既有行为不变）', () => {
  it('3 张无对甩牌可被 3 张主牌毙', () => {
    const lead = [
      c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King), c(Suit.Diamond, R.Queen),
    ];
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Four), c(Suit.Spade, R.Five),
    ], lead), true);
  });

  it('同门跟牌压不过成立的甩牌', () => {
    const lead = [
      c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King),
      c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    ];
    expectEqual(canBeat([
      c(Suit.Diamond, R.Two), c(Suit.Diamond, R.Two),
      c(Suit.Diamond, R.Three), c(Suit.Diamond, R.Three),
    ], lead), false);
  });
});

describe('judgePlays：无效毙牌不参与竞争', () => {
  const leadCards = [
    c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.King),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
  ];
  const lead = shapeOf(leadCards);

  const plays = [
    { player: PlayerPosition.East, cards: leadCards, handType: HandType.Throw },
    {
      player: PlayerPosition.North,
      handType: HandType.Throw,
      cards: [
        c(Suit.Spade, R.Three), c(Suit.Spade, R.Four),
        c(Suit.Spade, R.Six), c(Suit.Spade, R.Seven),
      ],
    },
    {
      player: PlayerPosition.West,
      handType: HandType.Throw,
      cards: [
        c(Suit.Spade, R.Eight), c(Suit.Spade, R.Eight),
        c(Suit.Spade, R.Nine), c(Suit.Spade, R.Ten),
      ],
    },
    {
      player: PlayerPosition.South,
      handType: HandType.Throw,
      cards: [
        c(Suit.Spade, R.Jack), c(Suit.Spade, R.Queen),
        c(Suit.Spade, R.King), c(Suit.Spade, R.Ace),
      ],
    },
  ];

  it('只有西家带对子 → 西家赢', () => {
    expectEqual(judgePlays(plays, lead, TRUMP, LEVEL), PlayerPosition.West);
  });

  it('其余三家都不带够对子 → 领出者赢', () => {
    const noValid = plays.filter(p => p.player !== PlayerPosition.West);
    expectEqual(judgePlays(noValid, lead, TRUMP, LEVEL), PlayerPosition.East);
  });
});

describe('canCompete：牌型要求不受影响', () => {
  it('单张不能与对子争胜', () => {
    const pairLead = shapeOf([c(Suit.Diamond, R.Seven), c(Suit.Diamond, R.Seven)]);
    expectTrue(
      !canCompete(shapeOf([c(Suit.Spade, R.Three)]), pairLead),
      '单张不应与对子争胜',
    );
  });
});

// ------------------------------------------------------------
// 盖毙甩牌：按「领出结构」比较大小
//   无对 → 顶张；有对无拖 → 顶对；有拖 → 最长拖拉机（长度优先，再比顶张）
// ------------------------------------------------------------

describe('盖毙甩牌：领出有对子（无拖拉机）→ 比顶对', () => {
  const leadCards = [
    c(Suit.Diamond, R.Ace), c(Suit.Diamond, R.Ace),
    c(Suit.Diamond, R.Five),
  ];
  const lead = shapeOf(leadCards);
  // 顶对 8、顶张 A；顶对 9、顶张 K
  const lowPairHighSingle = [
    c(Suit.Spade, R.Eight), c(Suit.Spade, R.Eight), c(Suit.Spade, R.Ace),
  ];
  const highPairLowSingle = [
    c(Suit.Spade, R.Nine), c(Suit.Spade, R.Nine), c(Suit.Spade, R.King),
  ];

  it('顶对大者赢（即使顶张更小）', () => {
    expectEqual(beats(highPairLowSingle, lowPairHighSingle, lead, TRUMP, LEVEL), true);
  });

  it('顶对小的压不过（即使顶张更大）', () => {
    expectEqual(beats(lowPairHighSingle, highPairLowSingle, lead, TRUMP, LEVEL), false);
  });
});

describe('盖毙甩牌：领出有拖拉机 → 比最长拖拉机', () => {
  const leadCards = [
    c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    c(Suit.Diamond, R.Ace),
  ];
  const lead = shapeOf(leadCards);
  // 拖 4、单张 A；拖 8、单张 K
  const lowTractorHighSingle = [
    c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
    c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
    c(Suit.Spade, R.Ace),
  ];
  const highTractorLowSingle = [
    c(Suit.Spade, R.Seven), c(Suit.Spade, R.Seven),
    c(Suit.Spade, R.Eight), c(Suit.Spade, R.Eight),
    c(Suit.Spade, R.King),
  ];

  it('拖大者赢（即使顶张更小）', () => {
    expectEqual(beats(highTractorLowSingle, lowTractorHighSingle, lead, TRUMP, LEVEL), true);
  });

  it('拖小者压不过（即使顶张更大）', () => {
    expectEqual(beats(lowTractorHighSingle, highTractorLowSingle, lead, TRUMP, LEVEL), false);
  });
});

describe('盖毙甩牌：最长拖拉机「长度优先」', () => {
  // 领出：一条 2 连拖 + 4 张单牌，count 8
  const lead = shapeOf([
    c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    c(Suit.Diamond, R.Seven), c(Suit.Diamond, R.Eight),
    c(Suit.Diamond, R.Nine), c(Suit.Diamond, R.Ten),
  ]);
  // 4 连拖，顶 6
  const longTractor = [
    c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
    c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
    c(Suit.Spade, R.Five), c(Suit.Spade, R.Five),
    c(Suit.Spade, R.Six), c(Suit.Spade, R.Six),
  ];
  // 两个互不相连的 2 连拖（3-4 与 9-10），最长拖顶 10（比上面高，但更短）
  const twoShortTractors = [
    c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
    c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
    c(Suit.Spade, R.Nine), c(Suit.Spade, R.Nine),
    c(Suit.Spade, R.Ten), c(Suit.Spade, R.Ten),
  ];

  it('4 连拖 > 2 连拖（不因点数更高而反转）', () => {
    expectEqual(beats(longTractor, twoShortTractors, lead, TRUMP, LEVEL), true);
    expectEqual(beats(twoShortTractors, longTractor, lead, TRUMP, LEVEL), false);
  });
});

// ------------------------------------------------------------
// 毙牌合法性：拖拉机结构必须「覆盖」领出
//   - 更长的拖拉机可以替代若干更短的拖拉机；
//   - 但数量不够（如只有一条 2 连拖却要顶两条）仍是垫牌。
// ------------------------------------------------------------

describe('毙牌合法性：拖拉机结构必须覆盖领出', () => {
  const lead = [
    c(Suit.Diamond, R.Four), c(Suit.Diamond, R.Four),
    c(Suit.Diamond, R.Five), c(Suit.Diamond, R.Five),
    c(Suit.Diamond, R.Ten), c(Suit.Diamond, R.Ten),
    c(Suit.Diamond, R.Jack), c(Suit.Diamond, R.Jack),
  ]; // 两条 2 连拖

  it('只有一条 2 连拖 + 两个独立对子 → 不能毙（数量不够）', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
      c(Suit.Spade, R.Eight), c(Suit.Spade, R.Eight),
      c(Suit.Spade, R.Queen), c(Suit.Spade, R.Queen),
    ], lead), false);
  });

  it('一条 4 连拖 → 可以毙（更长的拖可替代两条 2 连拖）', () => {
    expectEqual(canBeat([
      c(Suit.Spade, R.Three), c(Suit.Spade, R.Three),
      c(Suit.Spade, R.Four), c(Suit.Spade, R.Four),
      c(Suit.Spade, R.Five), c(Suit.Spade, R.Five),
      c(Suit.Spade, R.Six), c(Suit.Spade, R.Six),
    ], lead), true);
  });
});
