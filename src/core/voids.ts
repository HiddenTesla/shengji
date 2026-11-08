// ============================================================
// 断门推断 —— 只根据「已经打出的牌」推断某家是否断了某门
//
// 规则（相当于实战中的算牌）：
//   某一墩里，某家跟出的「领出门」的牌张数 < 领出张数 → 该家此门已断。
//   例：领出一对 ♥7（2 张），该家出 ♥4 + 另一门的任意一张 → 断 ♥。
//
// 注意：
//   - 只看**出牌张数**这一公开信息，不读手牌。若某家刚好跟满与领出相同的张数
//     （哪怕那正是他该门的最后几张），别人也无从得知 → **不**记为断门。
//   - 记录不可撤销地依赖牌局记录：悔牌（撤销）后 playState 回退，重新推断即可，
//     因此本模块是纯函数，不保存任何状态。
// ============================================================

import {
  type PlayedCards,
  type PlayerPosition,
  type Rank,
  type Suit,
  ALL_POSITIONS,
  SUIT_SYMBOL,
  Suit as S,
} from './types.ts';
import { type Door, doorOf } from './hand.ts';

/** 续用 hand.ts 的 Door 类型（'trump' | 副花色） */
export type { Door } from './hand.ts';

/** 一墩的出牌记录（已收的墩 Trick 与当前墩 TrickState 都满足这个结构） */
export interface TrickPlayLog {
  leadPlayer: PlayerPosition;
  plays: PlayedCards[];
}

/** 断门标记的颜色（深色底上可见） */
export const VOID_DOOR_COLOR: Record<Door, string> = {
  trump: '#ffd700',
  [S.Spade]: '#ffffff',
  [S.Heart]: '#ff6b6b',
  [S.Club]: '#7bd88f',
  [S.Diamond]: '#ffb74d',
  // 王不属于任何「门」，仅用于满足 Door 类型
  [S.Joker]: '#d0a0ff',
};

/** 断门的展示文本（主牌门用「主」，其余花色用符号） */
export function voidDoorLabel(door: Door): string {
  return door === 'trump' ? '主' : SUIT_SYMBOL[door];
}

/** 每家已断的门（已排序，主牌门在前） */
export type VoidMap = Record<PlayerPosition, Door[]>;

/** 门的展示顺序：主牌 → ♠ → ♥ → ♣ → ♦ */
const DOOR_ORDER: Record<Door, number> = {
  trump: 0,
  [S.Spade]: 1,
  [S.Heart]: 2,
  [S.Club]: 3,
  [S.Diamond]: 4,
  // 王不属于任何「门」（永远不会作为 door 出现），仅为满足 Door 类型
  [S.Joker]: 5,
};

/**
 * 从各墩的出牌记录推断「断门」。
 * @param tricks 按顺序的出牌记录（已收的墩 + 当前墩）
 */
export function inferVoids(
  tricks: readonly TrickPlayLog[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): VoidMap {
  const result: VoidMap = { E: [], S: [], W: [], N: [] };

  for (const trick of tricks) {
    const leadPlay = trick.plays.find(play => play.player === trick.leadPlayer)
      ?? trick.plays[0];
    if (!leadPlay || leadPlay.cards.length === 0) continue;

    const leadDoor = doorOf(leadPlay.cards[0], trumpSuit, levelRank);
    const leadCount = leadPlay.cards.length;

    for (const play of trick.plays) {
      if (play === leadPlay) continue;
      const sameDoorCount = play.cards
        .filter(card => doorOf(card, trumpSuit, levelRank) === leadDoor)
        .length;
      // 跟出的该门张数少于领出张数 → 该家此门必断
      if (sameDoorCount < leadCount && !result[play.player].includes(leadDoor)) {
        result[play.player].push(leadDoor);
      }
    }
  }

  for (const pos of ALL_POSITIONS) {
    result[pos].sort((a, b) => DOOR_ORDER[a] - DOOR_ORDER[b]);
  }
  return result;
}
