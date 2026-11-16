import { parseGameState } from '../state.ts';
import { expectEqual, it } from './harness.ts';

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
