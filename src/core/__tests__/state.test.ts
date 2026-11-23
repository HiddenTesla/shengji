import { buildStateSnapshot, parseGameState, type ExportStateInput } from '../state.ts';
import { expectEqual, expectTrue, it } from './harness.ts';
import { GamePhase, PlayerPosition, Rank, Suit, Team, type Card } from '../types.ts';

const EMPTY_TRICK_STATE = {
  schemaVersion: 1,
  phase: 'playing',
  levels: { 南北: '2', 东西: '3' },
  laps: { 南北: 1, 东西: 2 },
  banker: '南家',
  trumpSuit: '♠（S）',
  score: { defendingPoints: 35, bankerEscapePoints: 5 },
  bottomCards: [
    'S2#0', 'S3#0', 'S4#0', 'S5#0',
    'H2#0', 'H3#0', 'C2#0', 'D2#0',
  ],
  remainingHands: { 东家: [], 南家: [], 西家: [], 北家: [] },
  currentTrick: { leader: '南家', played: [], turn: '南家' },
};

function expectThrows(fn: () => unknown, includes: string): void {
  try {
    fn();
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(includes)) return;
    throw new Error(`错误信息“${message}”不包含“${includes}”`);
  }
  throw new Error(`预期抛出包含“${includes}”的错误`);
}

it('parses an exported state and its round metadata', () => {
  const parsed = parseGameState(JSON.stringify(EMPTY_TRICK_STATE));
  expectEqual(parsed.banker, 'S');
  expectEqual(parsed.levels, { NS: 2, EW: 3 });
  expectEqual(parsed.laps, { NS: 1, EW: 2 });
  expectEqual(parsed.trumpSuit, 'S');
  expectEqual(parsed.playState.turn, 'S');
  expectEqual(parsed.playState.trick.plays.length, 0);
});

it('accepts JSONC comments and trailing commas', () => {
  const jsonc = JSON.stringify(EMPTY_TRICK_STATE, null, 2)
    .replace('"phase": "playing",', '"phase": "playing", // active game')
    .replace('"turn": "南家"', '"turn": "南家",');
  expectEqual(parseGameState(jsonc).playState.trick.plays.length, 0);
});

it('reconstructs the current lead and detects a completed trick', () => {
  const parsed = parseGameState(JSON.stringify({
    ...EMPTY_TRICK_STATE,
    currentTrick: {
      leader: '南家',
      played: [
        { player: '南家', cards: ['S6#0'] },
        { player: '东家', cards: ['H4#0'] },
        { player: '北家', cards: ['C3#0'] },
        { player: '西家', cards: ['D3#0'] },
      ],
      turn: null,
    },
  }));
  expectEqual(parsed.playState.trick.complete, true);
  expectEqual(parsed.playState.trick.leadCount, 1);
  expectEqual(parsed.playState.trick.leadDoor, 'trump');
});

it('rejects non-playing snapshots and inconsistent turn positions', () => {
  expectThrows(
    () => parseGameState(JSON.stringify({ ...EMPTY_TRICK_STATE, phase: 'bidding_trump' })),
    '仅支持导入出牌阶段',
  );
  expectThrows(
    () => parseGameState(JSON.stringify({
      ...EMPTY_TRICK_STATE,
      currentTrick: { leader: '南家', played: [], turn: '北家' },
    })),
    '出牌顺序不匹配',
  );
});

// ---- 新导出格式（纯 ASCII） ----

const BOTTOM_IDS = [
  'S2#0', 'S3#0', 'S4#0', 'S5#0',
  'H2#0', 'H3#0', 'C2#0', 'D2#0',
];

function card(id: string): Card {
  return {
    id,
    suit: id[0] as Suit,
    rank: Number(id.slice(1, id.indexOf('#'))) as Rank,
  };
}

function exportInput(overrides: Partial<ExportStateInput> = {}): ExportStateInput {
  return {
    phase: GamePhase.Playing,
    levels: { [Team.NS]: Rank.Two, [Team.EW]: Rank.Three },
    laps: { [Team.NS]: 1, [Team.EW]: 2 },
    banker: PlayerPosition.South,
    trumpSuit: Suit.Spade,
    trumpDecided: true,
    defendingPoints: 35,
    bankerEscapePoints: 5,
    bottomCards: BOTTOM_IDS.map(card),
    hands: {
      [PlayerPosition.East]: [],
      [PlayerPosition.North]: [],
      [PlayerPosition.West]: [],
      [PlayerPosition.South]: [],
    },
    currentTrick: {
      leader: PlayerPosition.South,
      plays: [],
      turn: PlayerPosition.South,
    },
    cardIdMap: new Map(),
    ...overrides,
  };
}

it('exports an ASCII-only snapshot that can be imported again', () => {
  const text = JSON.stringify(buildStateSnapshot(exportInput()), null, 2);
  expectTrue(/^[\x20-\x7e\r\n\t]*$/.test(text), '导出的 JSON 只含 ASCII 字符');

  const parsed = parseGameState(text);
  expectEqual(parsed.banker, 'S');
  expectEqual(parsed.trumpSuit, 'S');
  expectEqual(parsed.levels, { NS: 2, EW: 3 });
  expectEqual(parsed.laps, { NS: 1, EW: 2 });
  expectEqual(parsed.bottomCards.length, 8);
  expectEqual(parsed.playState.turn, 'S');
});

it('exports none / undecided without Chinese characters', () => {
  const noTrump = JSON.stringify(buildStateSnapshot(exportInput({ trumpSuit: null })));
  expectTrue(noTrump.includes('"trumpSuit":"none"'), '无主导出为 none');
  expectTrue(/^[\x20-\x7e]*$/.test(noTrump), '无主快照只含 ASCII 字符');

  const undecided = buildStateSnapshot(exportInput({
    phase: GamePhase.BiddingTrump,
    trumpSuit: null,
    trumpDecided: false,
    banker: null,
    currentTrick: null,
  }));
  expectEqual(undecided.trumpSuit, 'undecided');
  expectEqual(undecided.banker, null);
  expectEqual(undecided.currentTrick, null);
});

it('imports the ASCII key format (team / position codes, none)', () => {
  const parsed = parseGameState(JSON.stringify({
    ...EMPTY_TRICK_STATE,
    levels: { NS: '2', EW: '3' },
    laps: { NS: 1, EW: 2 },
    banker: 'S',
    trumpSuit: 'none',
    remainingHands: { E: [], N: [], W: [], S: [] },
  }));
  expectEqual(parsed.banker, 'S');
  expectEqual(parsed.trumpSuit, null);
  expectEqual(parsed.levels, { NS: 2, EW: 3 });
  expectEqual(parsed.laps, { NS: 1, EW: 2 });
});

it('rejects undecided trump with a clear message', () => {
  expectThrows(
    () => parseGameState(JSON.stringify({
      ...EMPTY_TRICK_STATE,
      trumpSuit: 'undecided',
    })),
    '未定',
  );
});
