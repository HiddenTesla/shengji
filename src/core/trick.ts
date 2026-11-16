// ============================================================
// 墩比较（步骤 5）
//
// 判定规则：
//   1. 只有「同门或主牌」的牌才可能赢；其余为垫牌，不能赢
//   2. 主牌 > 副牌（毙）；主牌之间按主牌次序比大小（盖毙）
//   3. 同门之间按门内次序比大小
//   4. 必须与首出「同型」才可争胜：单张 vs 单张、对子 vs 对子、
//      拖拉机 vs 同长度拖拉机；甩牌按「张数相同」比较
//      （甩牌成立时同门跟牌一律压不过，只有毙牌才可能大过；
//       被拦的甩牌已在 play.ts::applyPlay 里「自动出小」改出）
//      **毙牌也要「带够」对子 / 拖拉机**：首出甩牌含 N 个对子时，毙牌对子不能少于 N；
//      首出含各长度的拖拉机时，毙牌的拖拉机结构必须能「覆盖」它
//      （更长的拖可替代若干更短的拖，但数量不能少，见 hand.ts::tractorsCover），
//      否则只能算垫牌。
//   5. 甩牌被毙（盖毙）时，比较维度由**领出的结构**决定：
//        领出无对子          → 比顶张（最大单张）
//        领出有对子、无拖拉机 → 比顶对（最大的对子）
//        领出有拖拉机         → 比最长拖拉机（长度优先，再比顶张）
//   6. 同大时先出者赢（使用严格大于比较）
// ============================================================

import {
  type Card,
  type HandType,
  type PlayedCards,
  type PlayerPosition,
  type Rank,
  type Suit,
  HandType as HT,
} from './types.ts';
import {
  type HandShape,
  analyzeShape,
  slotOf,
  handTractorRuns,
  handTopPairSlot,
  tractorsCover,
} from './hand.ts';

/**
 * 一手牌在本墩的层级：
 *   2 = 主牌毙（首出非主）
 *   1 = 与首出同门（首出为主牌时即主牌）
 *   0 = 垫牌 —— 不能赢
 *
 * 毙牌的条件：1) 全部是主牌；2) **带够对子 + 拖拉机**——
 * 首出甩牌里有 N 个对子（最长拖拉机 L 对）时，毙牌也必须至少有 N 个对子
 * 与一条不短于 L 的拖拉机，否则只是「垫主牌」，算垫牌。
 */
function tierOf(
  cards: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const shape = analyzeShape(cards, trumpSuit, levelRank);
  const door = shape.door;
  if (door === null) return 0;
  if (door !== 'trump') return door === lead.door ? 1 : 0;
  // 主牌：首出也是主牌 → 同门；否则必须满足毙牌的牌型要求
  if (lead.door === 'trump') return 1;
  if (shape.pairs < lead.pairs) return 0;
  // 拖拉机结构必须「覆盖」领出：更长的拖可替代若干更短的拖，但数量不能少
  if (!tractorsCover(shape.tractorRuns, lead.tractorRuns)) return 0;
  return 2;
}

/** 这手牌里「最长拖拉机」的强度（长度优先，其次顶张）；无拖拉机时返回 length 0 */
function longestTractorOf(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): { length: number; topSlot: number } {
  let best = { length: 0, topSlot: -Infinity };
  for (const run of handTractorRuns(cards, trumpSuit, levelRank)) {
    if (
      run.length > best.length
      || (run.length === best.length && run.topSlot > best.topSlot)
    ) {
      best = run;
    }
  }
  return best;
}

/** 同层内比较用的强度 = 该手牌中最大的「门内槽位」 */
function strengthOf(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  let max = -Infinity;
  for (const c of cards) {
    const s = slotOf(c, trumpSuit, levelRank);
    if (s > max) max = s;
  }
  return max;
}

/** 牌型是否能与首出「争胜」（需同型同长度） */
export function canCompete(shape: HandShape, lead: HandShape): boolean {
  switch (lead.type) {
    case HT.Single:
      return shape.type === HT.Single;
    case HT.Pair:
      return shape.type === HT.Pair;
    case HT.Tractor:
      return shape.type === HT.Tractor && shape.tractor === lead.tractor;
    default:
      // 甩牌：按「张数相同」参与比较；甩牌成立时同门跟牌一律压不过（见 beats），
      // 只有毙牌才可能大过（被拦时已在 play.ts 中「自动出小」改出）
      return shape.count === lead.count;
  }
}

/**
 * candidate 能否压过当前的 best
 *
 * @param lead 首出牌的构成（决定首出门与牌型）
 */
export function beats(
  candidate: Card[],
  best: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (lead.door === null) return false;

  const cs = analyzeShape(candidate, trumpSuit, levelRank);
  // 不能与首出「同型同长度」→ 不能赢（如：不能拿主牌单张/非对子毙副牌对子）
  if (!canCompete(cs, lead)) return false;

  const ct = tierOf(candidate, lead, trumpSuit, levelRank);

  // 甩牌成立时：同门跟牌一定小于领出（甩牌本身已保证该门要不上），
  // 只有主牌毙牌（跨门 tier = 2）才可能大过甩牌；主牌甩牌则无人能大过。
  if (lead.type === HT.Throw && ct !== 2) return false;

  const bs = analyzeShape(best, trumpSuit, levelRank);
  // 当前最大者若本身不能争胜（纯垫牌 / 无效毙牌），按垫牌处理
  const bt = canCompete(bs, lead)
    ? tierOf(best, lead, trumpSuit, levelRank)
    : 0;

  // 不同层：层级高的赢（主牌毙 > 同门 > 垫牌）
  if (ct !== bt) return ct > bt;
  // 同为垫牌：谁也赢不了（先出者保持）
  if (ct === 0) return false;

  // 甩牌：按领出的结构比较（无对 → 顶张；有对无拖 → 顶对；有拖 → 最长拖拉机）
  if (lead.type === HT.Throw) {
    return compareThrowStrength(candidate, best, lead, trumpSuit, levelRank) > 0;
  }

  return strengthOf(candidate, trumpSuit, levelRank)
    > strengthOf(best, trumpSuit, levelRank);
}

/**
 * 甩牌被两家以上毙时，比较两手有效毙牌的大小（> 0 表示 candidate 更大）。
 * 比较维度取决于领出的结构：
 *   - 领出含拖拉机 → 比「最长拖拉机」（长度优先，再比顶张）
 *   - 领出含对子（无拖拉机）→ 比「顶对」
 *   - 领出无对子 → 比「顶张」
 * 平局（返回 0）由调用方按「先出者赢」处理（严格大于才盖过）。
 */
function compareThrowStrength(
  candidate: Card[],
  best: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (lead.maxTractor >= 2) {
    const a = longestTractorOf(candidate, trumpSuit, levelRank);
    const b = longestTractorOf(best, trumpSuit, levelRank);
    if (a.length !== b.length) return a.length - b.length;
    return a.topSlot - b.topSlot;
  }
  if (lead.pairs > 0) {
    return handTopPairSlot(candidate, trumpSuit, levelRank)
      - handTopPairSlot(best, trumpSuit, levelRank);
  }
  return strengthOf(candidate, trumpSuit, levelRank)
    - strengthOf(best, trumpSuit, levelRank);
}

/** 判定本墩赢家（按出牌顺序，同大时先出者赢） */
export function judgePlays(
  plays: PlayedCards[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayerPosition {
  if (plays.length === 0) {
    throw new Error('judgePlays: 没有出牌记录');
  }
  let best = plays[0];
  for (let i = 1; i < plays.length; i++) {
    if (beats(plays[i].cards, best.cards, lead, trumpSuit, levelRank)) {
      best = plays[i];
    }
  }
  return best.player;
}
