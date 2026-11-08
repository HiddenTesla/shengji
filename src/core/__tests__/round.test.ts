// ============================================================
// 整局对战回归测试（四家都由 AI 托管，纯引擎层，不涉及 UI）
//
// 目的：
//   1. 新规则（毙牌必须带够对子 / 拖拉机）不会让引擎产生非法出牌；
//   2. 一局能正常打完（四家手牌出空）；
//   3. 逐墩扫描不变量：甩牌不会被「同门跟牌」或「牌型不够的毙牌」赢下。
// ============================================================

import {
  type Card,
  ALL_POSITIONS,
  HandType,
  type PlayerPosition,
  Rank,
  Suit,
  partnerOf,
} from '../types.ts';
import { createDecks, dealCards, shuffleCards } from '../deck.ts';
import { aiChooseBury } from '../bury.ts';
import { aiChoosePlay } from '../ai.ts';
import { analyzeShape } from '../hand.ts';
import {
  type PlayState,
  applyPlay,
  collectTrick,
  createPlayState,
  validatePlay,
} from '../play.ts';
import { describe, expectEqual, it } from './harness.ts';

const BOTTOM_COUNT = 8;
const LEVEL = Rank.Two;

type Hands = Record<PlayerPosition, Card[]>;

interface RoundResult {
  /** 非法出牌次数（应为 0） */
  illegal: number;
  /** 结束时四家剩余手牌总数（应为 0） */
  remaining: number;
  /** 「甩牌被不合规的方式赢下」的违例描述 */
  badTrick: string[];
  /** 其它中断原因（如 AI 没给出牌） */
  broken: string | null;
}

/** 打一整局：庄家拿底牌 → 埋 8 张 → 出到收墩为止 */
function playRound(
  seed: number,
  trumpSuit: Suit | null,
  banker: PlayerPosition,
): RoundResult {
  const deck = createDecks();
  shuffleCards(deck, seed);
  const { hands, bottom } = dealCards(deck, BOTTOM_COUNT);

  const all: Hands = {
    E: [...hands.E],
    S: [...hands.S],
    W: [...hands.W],
    N: [...hands.N],
  };

  // 庄家收底牌后埋 8 张
  all[banker] = [...all[banker], ...bottom];
  const buried = aiChooseBury(all[banker], BOTTOM_COUNT, trumpSuit, LEVEL, 0, {
    partnerHand: all[partnerOf(banker)],
  });
  const buriedIds = new Set(buried.map(card => card.id));
  all[banker] = all[banker].filter(card => !buriedIds.has(card.id));

  let state: PlayState = createPlayState(banker);
  let handsNow: Hands = all;
  let illegal = 0;
  const badTrick: string[] = [];
  let broken: string | null = null;

  for (let step = 0; step < 400; step++) {
    const player = state.turn;
    const cards = aiChoosePlay(state, handsNow, trumpSuit, LEVEL);
    if (!cards || cards.length === 0) {
      broken = `AI 未给出牌（第 ${state.tricks.length + 1} 墩，${player}）`;
      break;
    }

    const check = validatePlay(state, handsNow[player], cards, trumpSuit, LEVEL);
    if (!check.ok) {
      illegal++;
      broken = `非法出牌（第 ${state.tricks.length + 1} 墩，${player}）：${check.reason}`;
      break;
    }

    const played = applyPlay(handsNow, state, player, cards, trumpSuit, LEVEL);
    handsNow = played.hands;
    state = played.state;
    if (!state.trick.complete) continue;

    const issue = checkTrickWinner(state, trumpSuit);
    if (issue) badTrick.push(`第 ${state.tricks.length + 1} 墩：${issue}`);

    const collected = collectTrick(handsNow, state, bottom, trumpSuit, LEVEL);
    handsNow = collected.hands;
    state = collected.state;
    if (collected.roundOver) break;
  }

  return {
    illegal,
    remaining: ALL_POSITIONS.reduce((sum, pos) => sum + handsNow[pos].length, 0),
    badTrick,
    broken,
  };
}

/**
 * 甩牌领出（首出非主、含对子 / 拖拉机）时检查赢家：
 *   - 赢家只能是领出者本人，或用主牌「带够对子 + 足够长拖拉机」毙牌的人；
 *   - 同门跟牌 / 不合规的毙牌都不该赢。
 */
function checkTrickWinner(state: PlayState, trumpSuit: Suit | null): string | null {
  const trick = state.trick;
  if (trick.leadDoor === null || trick.leadDoor === 'trump') return null;
  if (trick.leadType !== HandType.Throw) return null;

  const winnerPlay = trick.plays.find(play => play.player === trick.winner);
  if (!winnerPlay) return null;

  const shape = analyzeShape(winnerPlay.cards, trumpSuit, LEVEL);
  const isRuff = shape.door === 'trump';
  const isLead = winnerPlay.player === trick.leadPlayer;
  if (isLead) return null;
  if (!isRuff) return `甩牌被非同门的牌赢下（door=${String(shape.door)}）`;
  if (shape.pairs < trick.leadPairs) {
    return `毙牌对子不够：领出 ${trick.leadPairs} 个，毙牌 ${shape.pairs} 个`;
  }
  if (shape.maxTractor < trick.leadMaxTractor) {
    return `毙牌拖拉机不够长：领出 ${trick.leadMaxTractor} 对，毙牌 ${shape.maxTractor} 对`;
  }
  return null;
}

/** 跑一整批对局，返回失败摘要（空数组 = 全部通过） */
function runBatch(trumpSuit: Suit | null, seeds: number): string[] {
  const problems: string[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const banker = ALL_POSITIONS[seed % ALL_POSITIONS.length];
    const r = playRound(seed, trumpSuit, banker);
    if (r.illegal === 0 && r.remaining === 0 && r.badTrick.length === 0 && !r.broken) {
      continue;
    }
    problems.push(
      `seed=${seed} banker=${banker} illegal=${r.illegal} remaining=${r.remaining}`
      + ` broken=${r.broken ?? '-'} badTrick=${r.badTrick.slice(0, 2).join(' | ') || '-'}`,
    );
  }
  return problems;
}

// ------------------------------------------------------------

describe('整局回归（四家 AI 托管）', () => {
  it('♠ 主：30 局全部打完、无非法出牌、无违规毙牌', () => {
    expectEqual(runBatch(Suit.Spade, 30), []);
  });

  it('无主：30 局全部打完、无非法出牌、无违规毙牌', () => {
    expectEqual(runBatch(null, 30), []);
  });
});
