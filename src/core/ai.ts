// ============================================================
// 完美信息 AI：基于四家可见手牌，对当前单张墩做极小化搜索
// ============================================================

import {
  type Card,
  type PlayerPosition,
  type Suit,
  HandType,
  ALL_POSITIONS,
  Rank,
  isPointCard,
  nextPlayer,
  teamOf,
} from './types.ts';
import {
  type HandShape,
  analyzeShape,
  chooseFollow,
  chooseLead,
  doorOf,
  slotOf,
  sortForDiscard,
  throwFallback,
  validateFollow,
} from './hand.ts';
import { beats, judgePlays } from './trick.ts';
import { trickPoints } from './scoring.ts';
import type { Hands, PlayState } from './play.ts';

const TRICK_WIN_VALUE = 1000;

/**
 * 「安全 10 分牌」领出加成。
 *
 * 适用于副牌里的 K 和 10（且不是级牌）。只要两名对手都没有比它更大的同门牌，
 * 它就是安全的：领它可以稳收 10 分，同时把更大的控制牌留在手里。
 *
 * 这自然覆盖了两种情形：
 *   - A 已走掉 / 在底里，K 成为该门最高牌；
 *   - A、K、Q、J 都已走掉 / 在底里，J 成为新的 A，10 成为新的 K。
 *
 * 另外要求没有「该门缺门且手里有主牌」的对手，否则可能被毙。
 * 加成只在真的赢下本墩时兑现（见 utility）。
 *
 * 60 足以压过单张墩内最多约 40 分的分差，但远小于赢 / 输墩的 ±1000，
 * 因此只会改变「都能赢时先出哪张」的排序，不会去抢赢不了的墩。
 */
const SAFE_POINT_LEAD_BONUS = 60;

function safePointLeadBonus(
  card: Card,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  // 只处理 10 分牌；该牌为级牌时是主牌，本技巧不适用
  if (card.rank !== Rank.King && card.rank !== Rank.Ten) return 0;
  if (card.rank === levelRank) return 0;

  const door = doorOf(card, trumpSuit, levelRank);
  if (door === 'trump') return 0;

  // 手里有同门同点数的另一张 → 优先按对子整体出，不奖励拆单张
  const hasPairMate = hands[player].some(c =>
    c.id !== card.id && c.suit === card.suit && c.rank === card.rank);
  if (hasPairMate) return 0;

  const slot = slotOf(card, trumpSuit, levelRank);
  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player));
  for (const pos of opponents) {
    const hand = hands[pos];
    // 对手手里有更大的同门牌 → 这张 10 分牌不是最高牌
    if (hand.some(c =>
      doorOf(c, trumpSuit, levelRank) === door
      && slotOf(c, trumpSuit, levelRank) > slot,
    )) {
      return 0;
    }
    // 对手该门缺门且手里还有主牌 → 可能直接毙掉
    const hasDoor = hand.some(c => doorOf(c, trumpSuit, levelRank) === door);
    const canRuff = hand.some(c => doorOf(c, trumpSuit, levelRank) === 'trump');
    if (!hasDoor && canRuff) {
      return 0;
    }
  }

  return SAFE_POINT_LEAD_BONUS;
}

/**
 * 钓主（ruff bait）评价：
 * 主动领出对手可毙的副牌组合，用少量送分换取对手主牌的消耗。
 * 每钓出 1 张主牌按 1 墩估值；但组合本身每张主牌最多允许送 5 分，
 * 超过则不值得（如一对 5 = 10 分 / 2 张主牌，值得；K1010 = 30 分 / 3 张，不值得）。
 */
const TRUMP_DRAW_VALUE = TRICK_WIN_VALUE;
const RUFF_BAIT_POINT_PER_TRUMP = 5;
const RUFF_BAIT_MAX_BONUS = 2 * TRICK_WIN_VALUE;
const RUFF_BAIT_OVER_POINT_PENALTY = 2;
const MAX_THROW_LEAD_CARDS = 5;
const MAX_THROW_LEAD_CANDIDATES = 20;
/** AK 甩牌把某对手该门仅剩的 2 张全部抓获时，额外加成 */
const AK_CAPTURE_BONUS = 60;
/** 安全 KK 对子（外面无 AA）的领出加成 */
const SAFE_PAIR_LEAD_BONUS = 60;
/** 对手的 AA 是其该门唯一对子时，拆 KK 领单张 K 的加成 */
const SPLIT_KING_BONUS = 60;
/** 分牌例外：0 分墩、只有分牌能压、且受益方无法加分时，压牌的惩罚 */
const PASS_POINT_CARD_PENALTY = 2 * TRICK_WIN_VALUE + 50;
/** 跟单张时拆对子 / 拆拖拉机的结构惩罚 */
const BREAK_PAIR_PENALTY = 6;
const BREAK_TRACTOR_PENALTY = 7;

/**
 * 「领出主牌控制牌」惩罚。
 *
 * 单张搜索只看一墩，「用大王稳赢这一墩」的收益被记成完整的 ±TRICK_WIN_VALUE，
 * 于是 AI 会像对待副牌 A 一样，把王当作「安全大牌」领出来抢一墩。
 * 但王能稳收以后的一墩：领出来只是把「以后的一墩」提前兑现，并不真的多赢一墩；
 * 正常玩家几乎不会领出大王，而是先出小主牌吊主。
 *
 * 惩罚扣得比一墩的价值还多，所以除非手里只剩这几张牌，AI 不会领出大王 / 小王。
 * 小主牌、级牌、普通主牌都不受影响，「吊主」和副牌的「安全大牌」领出照旧。
 * 只在领出单张时计入，跟牌不受影响。
 */
const LEAD_BIG_JOKER_PENALTY = 2600;
const LEAD_SMALL_JOKER_PENALTY = 2200;

/** 领出王（主牌里唯一的「永远安全」大牌）的保留惩罚；其它牌 → 0 */
function leadJokerPenalty(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (doorOf(card, trumpSuit, levelRank) !== 'trump') return 0;
  if (card.rank === Rank.BigJoker) return LEAD_BIG_JOKER_PENALTY;
  if (card.rank === Rank.SmallJoker) return LEAD_SMALL_JOKER_PENALTY;
  return 0;
}

/**
 * 「靠自家的王接自己的主分牌」惩罚。
 *
 * 副牌有「已方确定大牌 → 领出该门分牌」的技巧（见 `safePointLeadBonus`），
 * 但这条技巧**不能套用到主牌**。单张搜索只看一墩，只要结果是我们这边最大
 * 就按 +TRICK_WIN_VALUE 记，于是 AI 会为了多收 5 / 10 分而领出主 5 / 主 10 / 主 K，
 * 让对家的大王 / 小王把这一墩接走。
 * 实战里几乎不会这样打：王是控制牌，要留着抢有分的墩；吊主应该领小主牌，
 * 而不是用一张主分牌把对家的王钓出来。
 *
 * 只在下面三条同时成立时计入：
 *   1. 领出的这一手是主牌、且本身是分牌（5 / 10 / K，级牌除外——级牌是控制牌）；
 *   2. 本墩由本方赢下，且赢的那手牌里有王（= 对家垫了王）；
 *   3. 本墩分值不高（否则用王收分是划算的）。
 */
const LEAD_TRUMP_POINT_MAX_TRICK_POINTS = 20;

function leadTrumpPointJokerPenalty(
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  winner: PlayerPosition,
  rootTeam: ReturnType<typeof teamOf>,
  points: number,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (lead.door !== 'trump') return 0;
  if (lead.count !== 1) return 0;
  if (points > LEAD_TRUMP_POINT_MAX_TRICK_POINTS) return 0;
  if (teamOf(winner) !== rootTeam) return 0;

  // 领出的牌必须是主分牌；王由 leadJokerPenalty 单独处理，级牌是控制牌不算
  const led = plays[0].cards[0];
  if (led.rank === levelRank) return 0;
  if (!isPointCard(led.rank)) return 0;

  const winnerCards = plays.find(play => play.player === winner)?.cards ?? [];
  if (winnerCards.some(card => card.rank === Rank.BigJoker)) {
    return LEAD_BIG_JOKER_PENALTY;
  }
  if (winnerCards.some(card => card.rank === Rank.SmallJoker)) {
    return LEAD_SMALL_JOKER_PENALTY;
  }
  return 0;
}

function cardCost(card: Card, trumpSuit: Suit | null, levelRank: Rank): number {
  const slot = slotOf(card, trumpSuit, levelRank);
  return doorOf(card, trumpSuit, levelRank) === 'trump' ? 20 + slot : slot;
}

interface LeadPairUnit {
  slot: number;
  cards: Card[];
}

/** 把一门手牌拆成对子单元（用于生成领出候选 / 判断能否毙牌） */
function leadPairUnits(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): LeadPairUnit[] {
  const byKey = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.suit}|${card.rank}`;
    const arr = byKey.get(key) ?? [];
    arr.push(card);
    byKey.set(key, arr);
  }
  const units: LeadPairUnit[] = [];
  for (const arr of byKey.values()) {
    if (arr.length >= 2) {
      units.push({ slot: slotOf(arr[0], trumpSuit, levelRank), cards: arr.slice(0, 2) });
    }
  }
  return units;
}

/** 是否存在指定长度的连续对子段（拖拉机） */
function hasConsecutivePairRun(units: LeadPairUnit[], length: number): boolean {
  if (length < 2 || units.length < length) return false;
  const sorted = [...units].sort((a, b) => a.slot - b.slot);
  for (let i = 0; i + length <= sorted.length; i++) {
    let ok = true;
    for (let j = 1; j < length; j++) {
      if (sorted[i + j].slot !== sorted[i + j - 1].slot + 1) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * 判断某家能否用主牌毙掉这手副牌领出（只判断合法性与形态，不比较大小）。
 * 注意：补牌本身不限牌型，但「想大出」必须用同型主牌：
 * 对子需主牌对子、拖拉机需同长主牌拖拉机（与 trick.ts::canCompete 一致）。
 */
function canRuffWithTrump(
  hand: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (lead.door === null || lead.door === 'trump') return false;
  if (hand.some(c => doorOf(c, trumpSuit, levelRank) === lead.door)) return false;

  const trumps = hand.filter(c => doorOf(c, trumpSuit, levelRank) === 'trump');
  if (trumps.length < lead.count) return false;

  if (lead.maxTractor >= 2) {
    return hasConsecutivePairRun(
      leadPairUnits(trumps, trumpSuit, levelRank),
      lead.maxTractor,
    );
  }
  if (lead.pairs > 0) {
    const needPairs = Math.min(lead.pairs, Math.floor(lead.count / 2));
    return leadPairUnits(trumps, trumpSuit, levelRank).length >= needPairs;
  }
  return true;
}

/** 预估毙牌方需要消耗的主牌力（取最便宜的若干张主牌） */
function cheapestRuffCost(
  hand: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const trumps = hand
    .filter(c => doorOf(c, trumpSuit, levelRank) === 'trump')
    .sort((a, b) =>
      cardCost(a, trumpSuit, levelRank) - cardCost(b, trumpSuit, levelRank),
    );
  return trumps
    .slice(0, lead.count)
    .reduce((sum, c) => sum + cardCost(c, trumpSuit, levelRank), 0);
}

/** 从 leader 开始的四家出牌顺序 */
function turnOrderFrom(player: PlayerPosition): PlayerPosition[] {
  const order: PlayerPosition[] = [player];
  let current = player;
  for (let i = 0; i < 3; i++) {
    current = nextPlayer(current);
    order.push(current);
  }
  return order;
}

/**
 * 拆 KK 领单张 K 的加成：
 * 对手持有该门 AA，且 AA 是其在该门唯一的对子。
 * 此时若领 KK，对手可以用 AA 作为对子直接管上；拆成单张 K 则迫使对手要么拆掉唯一的对子，
 * 要么放掉这一墩。
 */
function splitKingLeadBonus(
  card: Card,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (card.rank !== Rank.King || card.rank === levelRank) return 0;
  const door = doorOf(card, trumpSuit, levelRank);
  if (door === 'trump') return 0;

  const hasPairMate = hands[player].some(c =>
    c.id !== card.id && c.suit === card.suit && c.rank === Rank.King);
  if (!hasPairMate) return 0;

  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player));
  for (const pos of opponents) {
    const oppDoorCards = hands[pos].filter(
      c => doorOf(c, trumpSuit, levelRank) === door,
    );
    const pairs = leadPairUnits(oppDoorCards, trumpSuit, levelRank);
    const hasAces = pairs.some(unit => unit.cards[0].rank === Rank.Ace);
    if (hasAces && pairs.length === 1) return SPLIT_KING_BONUS;
  }
  return 0;
}

/**
 * 「空甩一对 A」惩罚。
 *
 * 副牌的一对 A 必然管住这一墩，但它的价值在于**收分**：
 * 只有对家能加分、或者对手被迫垫分时，打掉这对控制牌才划算。
 * 若对家加不了分（有对子必须跟非分对子，或手里根本没有能出的分牌），
 * 对手也逼不出分（没有分对子、该门剩下的牌都不是分牌），
 * 领出这对 A 就只是用一张控制牌换一墩 0 分，评级要降低。
 */
const ACE_PAIR_NO_POINT_PENALTY = 200;

/** 跟「对子」时，某家**最少**被迫要出的分数（对手视角：会挑最不值钱的跟） */
function minPointsForcedVsPair(
  hand: Card[],
  door: Suit,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const need = 2;
  const inDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) === door);
  const inDoorIds = new Set(inDoor.map(c => c.id));
  const sortedFill = hand
    .filter(c => !inDoorIds.has(c.id))
    .map(c => trickPoints([c]))
    .sort((a, b) => a - b);

  if (inDoor.length >= need) {
    const units = leadPairUnits(inDoor, trumpSuit, levelRank);
    // 有对必对：挑一对最不值钱的
    if (units.length > 0) {
      return Math.min(...units.map(u => trickPoints(u.cards)));
    }
    // 没有对子：自由选 2 张，挑最不值钱的
    const points = inDoor.map(c => trickPoints([c])).sort((a, b) => a - b);
    return points[0] + points[1];
  }

  // 该门不足：门内牌必出，补牌挑最不值钱的
  return trickPoints(inDoor)
    + sortedFill.slice(0, need - inDoor.length).reduce((sum, p) => sum + p, 0);
}

/** 跟「对子」时，某家**最多**能加多少分（对家视角：愿意加分） */
function maxPointsAddableVsPair(
  hand: Card[],
  door: Suit,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const need = 2;
  const inDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) === door);
  const inDoorIds = new Set(inDoor.map(c => c.id));
  const sortedFill = hand
    .filter(c => !inDoorIds.has(c.id))
    .map(c => trickPoints([c]))
    .sort((a, b) => b - a);

  if (inDoor.length >= need) {
    const units = leadPairUnits(inDoor, trumpSuit, levelRank);
    // 有对必对：挑一对最值钱的（对家愿意送分）
    if (units.length > 0) {
      return Math.max(...units.map(u => trickPoints(u.cards)));
    }
    // 没有对子：自由选 2 张，挑最值钱的
    const points = inDoor.map(c => trickPoints([c])).sort((a, b) => b - a);
    return points[0] + points[1];
  }

  // 该门不足：门内牌必出，补牌挑最值钱的
  return trickPoints(inDoor)
    + sortedFill.slice(0, need - inDoor.length).reduce((sum, p) => sum + p, 0);
}

/**
 * 空甩一对 A 的降权：副牌 AA 领出后，对家加不了分、对手也逼不出分 → 扣分。
 * 主牌 A 对（吊主）与单张 A 不受影响。
 */
function acePairLeadPenalty(
  cards: Card[],
  lead: HandShape,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (lead.type !== HandType.Pair || cards.length !== 2) return 0;
  if (!cards.every(c => c.rank === Rank.Ace)) return 0;
  const door = doorOf(cards[0], trumpSuit, levelRank);
  if (door === 'trump') return 0;

  const partner = ALL_POSITIONS.find(
    pos => pos !== player && teamOf(pos) === teamOf(player),
  );
  const partnerPoints = partner
    ? maxPointsAddableVsPair(hands[partner], door, trumpSuit, levelRank)
    : 0;
  const opponentPoints = ALL_POSITIONS
    .filter(pos => teamOf(pos) !== teamOf(player))
    .reduce((sum, pos) =>
      sum + minPointsForcedVsPair(hands[pos], door, trumpSuit, levelRank), 0);

  return partnerPoints + opponentPoints > 0 ? 0 : ACE_PAIR_NO_POINT_PENALTY;
}

/**
 * 跟单张时拆对子 / 拆拖拉机的结构惩罚。
 * 只是评分偏好：如果拆结构能赢墩或抢到关键分数，+1000 的赢墩价值仍会压过它。
 */
function breakStructurePenalty(
  card: Card,
  hand: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const door = doorOf(card, trumpSuit, levelRank);
  const doorCards = hand.filter(
    c => doorOf(c, trumpSuit, levelRank) === door,
  );
  const units = leadPairUnits(doorCards, trumpSuit, levelRank);
  const unit = units.find(u => u.cards.some(c => c.id === card.id));
  if (!unit) return 0;

  const slots = new Set(units.map(u => u.slot));
  const inTractor = slots.has(unit.slot - 1) || slots.has(unit.slot + 1);
  return inTractor ? BREAK_TRACTOR_PENALTY : BREAK_PAIR_PENALTY;
}

/**
 * 某家是否还能往这一墩里加分：
 *   - 有该门牌：必须跟该门，只能看该门内的分牌；
 *   - 该门缺门：可垫任意牌，也可用分牌毙，手里有分牌就能加分。
 */
function canAddPointsToTrick(
  hand: Card[],
  door: Suit | 'trump',
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  const hasDoor = hand.some(c => doorOf(c, trumpSuit, levelRank) === door);
  if (hasDoor) {
    return hand.some(c =>
      doorOf(c, trumpSuit, levelRank) === door && isPointCard(c.rank));
  }
  return hand.some(c => isPointCard(c.rank));
}

/**
 * 「大主」权重：大王 1、小王 0.8、级牌 0.4；主 A 及以下、副牌 = 0。
 * 用于「用大主换一墩无分 / 逼对家用大主保分」的降权。
 */
function bigTrumpWeight(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (doorOf(card, trumpSuit, levelRank) !== 'trump') return 0;
  if (card.rank === Rank.BigJoker) return 1;
  if (card.rank === Rank.SmallJoker) return 0.8;
  if (card.rank === levelRank) return 0.4;
  return 0;
}

/** 用大主去管一个暂时 0 分的墩：控制牌换一墩无分，评分要降 */
const BIG_TRUMP_EMPTY_TRICK_PENALTY = 2600;
/** 出了分牌，却要逼对家用大主来保这墩：等于拿对家的控制牌换这点分 */
const POINT_FEED_BIG_TRUMP_PENALTY = 800;

/** 当前已出牌里最大的那一手（同大先出者赢） */
function bestPlayOf(
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayState['trick']['plays'][number] | null {
  let best: PlayState['trick']['plays'][number] | null = null;
  for (const play of plays) {
    if (!best || beats(play.cards, best.cards, lead, trumpSuit, levelRank)) {
      best = play;
    }
  }
  return best;
}

/**
 * 跟牌时用「大主」去管一个暂时无分的墩 → 降权。
 * 只有真的靠这张牌管住当前最大（`beats` 成立）且全墩暂时 0 分时才罚；
 * 该墩已经有分（值得抢）时不罚。
 */
function bigTrumpEmptyTrickPenalty(
  state: PlayState,
  lead: HandShape,
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const weight = bigTrumpWeight(card, trumpSuit, levelRank);
  if (weight === 0) return 0;

  const tablePoints = trickPoints(state.trick.plays.flatMap(p => p.cards))
    + trickPoints([card]);
  if (tablePoints > 0) return 0;

  const best = bestPlayOf(state.trick.plays, lead, trumpSuit, levelRank);
  if (!best || !beats([card], best.cards, lead, trumpSuit, levelRank)) return 0;
  return BIG_TRUMP_EMPTY_TRICK_PENALTY * weight;
}

/**
 * 某家为了赢下这一手，最省的赢牌方式是不是大主（王 / 级牌）：
 * 返回该牌的大主权重（见 `bigTrumpWeight`）；赢不了 → null。
 */
function cheapestWinningWeight(
  hand: Card[],
  lead: HandShape,
  bestCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): number | null {
  let cheapestCost = Infinity;
  let cheapestWeight = 0;
  for (const option of hand) {
    if (!validateFollow(hand, lead, [option], trumpSuit, levelRank).ok) continue;
    if (!beats([option], bestCards, lead, trumpSuit, levelRank)) continue;
    const cost = cardCost(option, trumpSuit, levelRank);
    if (cost < cheapestCost) {
      cheapestCost = cost;
      cheapestWeight = bigTrumpWeight(option, trumpSuit, levelRank);
    }
  }
  return cheapestCost === Infinity ? null : cheapestWeight;
}

/**
 * 下家（对手）最可能怎么压这一手：取「不动大主、代价最低」的能压过的牌。
 * 没有这种牌（压不过，或只能用大主压）→ null。
 * 对手要动大主才能压分反而是我们想要的（钓主），不按「能压回来」算。
 */
function cheapestPlainBeatingCard(
  hand: Card[],
  lead: HandShape,
  bestCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card | null {
  let cheapestCost = Infinity;
  let picked: Card | null = null;
  for (const option of hand) {
    if (!validateFollow(hand, lead, [option], trumpSuit, levelRank).ok) continue;
    if (!beats([option], bestCards, lead, trumpSuit, levelRank)) continue;
    if (bigTrumpWeight(option, trumpSuit, levelRank) > 0) continue;
    const cost = cardCost(option, trumpSuit, levelRank);
    if (cost < cheapestCost) {
      cheapestCost = cost;
      picked = option;
    }
  }
  return picked;
}

/**
 * 对家手上只剩最后一张主，且这张主压得住下家（第三家）的每一张牌。
 *
 * 这种「最后一张主」本来就要用掉、而且收的是确定的一墩，
 * 顺手多收 10 分不算浪费；对家还有第二张主时才该把大王留着继续控主。
 */
function partnerLastTrumpCoversNext(
  hands: Hands,
  lead: HandShape,
  partner: PlayerPosition,
  nextToPlay: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  const trumps = hands[partner].filter(
    card => doorOf(card, trumpSuit, levelRank) === 'trump',
  );
  if (trumps.length !== 1) return false;

  const [lastTrump] = trumps;
  return !hands[nextToPlay].some(card =>
    validateFollow(hands[nextToPlay], lead, [card], trumpSuit, levelRank).ok
    && beats([card], [lastTrump], lead, trumpSuit, levelRank));
}

/**
 * 「喂分却要逼对家用大主保」降权。
 *
 * 跟单张时打出分牌，如果出完之后这一墩还要靠对家动大主（王 / 级牌）才能拿下，
 * 就降低这张分牌的评分：多出来的分是「硬塞」的，代价却是对家的控制牌。
 * 两种情形都算：
 *   1. 出完仍是对手最大；
 *   2. 第二家：我这手分牌暂时最大，但下家（第三家）能用便宜牌压回来，
 *      最后还是得靠对家（第四家）救 —— 不能因为「对家反正能赢」就白白多送 10 分。
 * 对手要用大主才压得回来的情形不算（那是我们想要的钓主）。
 */
function pointFeedBigTrumpPenalty(
  state: PlayState,
  hands: Hands,
  player: PlayerPosition,
  lead: HandShape,
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (!isPointCard(card.rank)) return 0;

  const partner = ALL_POSITIONS.find(
    pos => pos !== player && teamOf(pos) === teamOf(player),
  );
  if (!partner) return 0;
  if (state.trick.plays.some(play => play.player === partner)) return 0;

  const before = bestPlayOf(state.trick.plays, lead, trumpSuit, levelRank);
  if (!before) return 0;

  // 出完之后这一墩归谁
  let bestCards = before.cards;
  let bestPlayer = before.player;
  if (beats([card], before.cards, lead, trumpSuit, levelRank)) {
    // 我这张牌暂时管住 → 还要看下家（第三家）能不能用便宜牌压回来
    const third = nextPlayer(player);
    if (teamOf(third) === teamOf(player)) return 0;
    const thirdCard = cheapestPlainBeatingCard(
      hands[third], lead, [card], trumpSuit, levelRank,
    );
    // 第三家压不回来（或只能用大主压）→ 对家不用救
    if (!thirdCard) return 0;
    bestCards = [thirdCard];
    bestPlayer = third;
  }
  if (teamOf(bestPlayer) === teamOf(player)) return 0;

  // 对家最省能赢的一手：优先看代价（主牌 > 副牌），代价最低的是不是大主
  const weight = cheapestWinningWeight(
    hands[partner], lead, bestCards, trumpSuit, levelRank,
  );
  if (!weight) return 0;
  // 对家只剩最后一张主、且压得下下家 → 这张主反正要用掉，多的分照收
  if (partnerLastTrumpCoversNext(
    hands, lead, partner, nextPlayer(player), trumpSuit, levelRank,
  )) {
    return 0;
  }
  return POINT_FEED_BIG_TRUMP_PENALTY * weight;
}

/**
 * 这张牌是不是「这一墩之后该门最大的牌」：
 * 其余三家同门都没有更大的牌，而且自己手上也没有更大的同门牌（那些是要留下的）。
 * 本墩已经打出的牌已经不在 `hands` 里，所以这里就等于「此 trick 之后」。
 */
function isDoorBoss(
  card: Card,
  hand: Card[],
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  const door = doorOf(card, trumpSuit, levelRank);
  const slot = slotOf(card, trumpSuit, levelRank);
  const higher = (c: Card) =>
    c.id !== card.id
    && doorOf(c, trumpSuit, levelRank) === door
    && slotOf(c, trumpSuit, levelRank) > slot;
  if (hand.some(higher)) return false;
  return !ALL_POSITIONS.some(pos =>
    pos !== player && hands[pos].some(higher));
}

/** 手上同门还有另一张 5 可以拿来顶替这张牌吗 */
function fiveInDoor(
  hand: Card[],
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card | null {
  const door = doorOf(card, trumpSuit, levelRank);
  return hand.find(c =>
    c.id !== card.id
    && c.rank === Rank.Five
    && doorOf(c, trumpSuit, levelRank) === door,
  ) ?? null;
}

/**
 * 这张牌该不该留着当门霸：0 分小牌（不是级牌）、手上同门还有 5 可以顶替，
 * 而且它在这墩之后是该门最大的牌。
 *
 * 送它是 0 分、送 5 是 5 分，但门霸能在后面的墩里替我们收分，
 * 一般宁可送 5 分把它留下。是 10 / K 时送 5 本来就少丢分，不需要这条。
 */
function worthKeepingAsBoss(
  card: Card,
  hand: Card[],
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (isPointCard(card.rank)) return false;
  if (card.rank === levelRank) return false;
  if (!fiveInDoor(hand, card, trumpSuit, levelRank)) return false;
  return isDoorBoss(card, hand, hands, player, trumpSuit, levelRank);
}

/**
 * 「把门霸白送出去」的降权（单张跟牌用）。
 * 「这一墩是不是真的赢不了」交给搜索里的 ±TRICK_WIN_VALUE 判断：
 * 能赢就赢（100 远小于 1000），只有必须送出去时这 100 分才会影响取舍。
 */
const GIVE_AWAY_DOOR_BOSS_PENALTY = 100;

function giveAwayDoorBossPenalty(
  card: Card,
  hand: Card[],
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  return worthKeepingAsBoss(card, hand, hands, player, trumpSuit, levelRank)
    ? GIVE_AWAY_DOOR_BOSS_PENALTY
    : 0;
}

/**
 * 多张跟牌时，`chooseFollow` 送出去的牌里如果夹着某门的门霸，
 * 而手上还有同门的 5 可以顶替，就换成 5（用 `validateFollow` 保证牌型仍然合法）。
 */
function keepDoorBossInFollow(
  play: Card[],
  hand: Card[],
  lead: HandShape,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  let result = play;
  for (let i = 0; i < result.length; i++) {
    const card = result[i];
    if (!worthKeepingAsBoss(card, hand, hands, player, trumpSuit, levelRank)) continue;
    const five = fiveInDoor(hand, card, trumpSuit, levelRank);
    if (!five || result.some(c => c.id === five.id)) continue;
    const swapped = result.map((c, idx) => (idx === i ? five : c));
    if (!validateFollow(hand, lead, swapped, trumpSuit, levelRank).ok) continue;
    result = swapped;
  }
  return result;
}

/** 这门这对牌是不是「死对子」：对手手里有更大的同门对子，它永远赢不了墩 */
function deadPairSuit(
  cards: Card[],
  rank: Rank,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Suit | null {
  const bySuit = new Map<Suit, Card[]>();
  for (const card of cards) {
    if (card.rank !== rank) continue;
    const arr = bySuit.get(card.suit) ?? [];
    arr.push(card);
    bySuit.set(card.suit, arr);
  }
  for (const [suit, pair] of bySuit) {
    if (pair.length < 2) continue;
    const door = doorOf(pair[0], trumpSuit, levelRank);
    const slot = slotOf(pair[0], trumpSuit, levelRank);
    const beaten = ALL_POSITIONS.some(pos =>
      pos !== player
      && teamOf(pos) !== teamOf(player)
      && leadPairUnits(
        hands[pos].filter(c => doorOf(c, trumpSuit, levelRank) === door),
        trumpSuit, levelRank,
      ).some(unit => unit.slot > slot));
    if (beaten) return suit;
  }
  return null;
}

/**
 * 「垫分」顺序：本方（对家）已经大出或基本确定大出时用。
 *
 *   1. 死对子（对手有更大的同门对子、永远赢不了墩）整对先垫 —— 一手就是 10 / 20 分；
 *   2. 单张 10 最优先，然后单张 5、单张 K（活的 5 / 10 / K 对子不拆）；
 *   3. 其余按普通垫牌顺序（0 分小牌先送）。
 */
function makeFeedPointsOrder(
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): (cards: Card[]) => Card[] {
  return (cards) => {
    const rest = [...cards];
    const out: Card[] = [];
    const takeWhere = (pred: (card: Card) => boolean) => {
      for (const card of [...rest]) {
        if (!pred(card)) continue;
        rest.splice(rest.indexOf(card), 1);
        out.push(card);
      }
    };
    const isPair = (card: Card) =>
      cards.filter(c => c.suit === card.suit && c.rank === card.rank).length >= 2;

    // 1) 死对子：10 对 → K 对 → 5 对（20 / 20 / 10 分）
    for (const rank of [Rank.Ten, Rank.King, Rank.Five]) {
      let suit = deadPairSuit(rest, rank, hands, player, trumpSuit, levelRank);
      while (suit !== null) {
        takeWhere(card => card.rank === rank && card.suit === suit);
        suit = deadPairSuit(rest, rank, hands, player, trumpSuit, levelRank);
      }
    }

    // 2) 单张分牌：10 → 5 → K
    for (const rank of [Rank.Ten, Rank.Five, Rank.King]) {
      takeWhere(card => card.rank === rank && !isPair(card));
    }

    // 3) 其余
    out.push(...sortForDiscard(rest, trumpSuit, levelRank));
    return out;
  };
}

/** 这手牌能不能压过当前最大（同门最优跟牌 + 毙牌两种都算） */
function handCanBeat(
  hand: Card[],
  lead: HandShape,
  bestCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (lead.door === null) return false;
  if (lead.door !== 'trump' && canRuffWithTrump(hand, lead, trumpSuit, levelRank)) {
    return true;
  }
  return followOptionsFor(hand, lead, trumpSuit, levelRank)
    .some(option => beats(option, bestCards, lead, trumpSuit, levelRank));
}

/**
 * 本方是不是「大出或基本确定大出」：当前最大是本方的牌，
 * 而且后面还没出牌的对手都压不过它（含毙牌）。
 */
function partnerLikelyWins(
  state: PlayState,
  hands: Hands,
  player: PlayerPosition,
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  const best = bestPlayOf(state.trick.plays, lead, trumpSuit, levelRank);
  if (!best || teamOf(best.player) !== teamOf(player)) return false;

  const played = new Set(state.trick.plays.map(play => play.player));
  return !ALL_POSITIONS.some(pos =>
    pos !== player
    && !played.has(pos)
    && teamOf(pos) !== teamOf(player)
    && handCanBeat(hands[pos], lead, best.cards, trumpSuit, levelRank));
}

/**
 * 「分牌例外」：第 3 家或第 2 家跟单张时，如果：
 *   - 当前大牌在对手手里；
 *   - 已出的牌都是 0 分；
 *   - 自己所有能压过的牌都是分牌；
 *   - 当前大牌那家的搭档无法再往这墩加分；
 *   - 自己还有合法的非分牌可以放过；
 * 则大幅降低分牌压牌的优先级，允许保留分牌。
 */
function pointCardPassPenalty(
  state: PlayState,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
  candidate: Card,
): number {
  const trick = state.trick;
  if (trick.leadDoor === null || trick.leadDoor === 'trump') return 0;
  if (trick.leadCount !== 1) return 0;
  if (trick.plays.length < 1 || trick.plays.length > 2) return 0;

  const leader = trick.leadPlayer;
  const second = nextPlayer(leader);
  const third = nextPlayer(second);
  const fourth = nextPlayer(third);
  if (player !== second && player !== third) return 0;

  const currentHighPlayer = player === third ? second : leader;
  if (teamOf(currentHighPlayer) === teamOf(player)) return 0;

  const lead: HandShape = {
    type: trick.leadType,
    door: trick.leadDoor,
    count: trick.leadCount,
    pairs: trick.leadPairs,
    tractor: trick.leadTractor,
    maxTractor: trick.leadMaxTractor,
  };
  if (judgePlays(trick.plays, lead, trumpSuit, levelRank) !== currentHighPlayer) {
    return 0;
  }

  // 第 1、2 家出的都是无分牌
  if (trickPoints(trick.plays.flatMap(play => play.cards)) !== 0) return 0;
  // 只保护 10 分牌（K / 10）；5 分牌价值较低，不触发此例外
  if (candidate.rank !== Rank.King && candidate.rank !== Rank.Ten) return 0;

  const bestPlay = trick.plays.find(play => play.player === currentHighPlayer);
  if (!bestPlay) return 0;

  // 手里所有能压过当前大牌的牌必须全都是分牌
  const beatingCards = hands[player].filter(card =>
    validateFollow(hands[player], lead, [card], trumpSuit, levelRank).ok
    && beats([card], bestPlay.cards, lead, trumpSuit, levelRank));
  if (beatingCards.length === 0) return 0;
  if (beatingCards.some(card => !isPointCard(card.rank))) return 0;

  // 必须存在一个比这张分牌更便宜的合法非分牌可以「放过」
  const candidateCost = cardCost(candidate, trumpSuit, levelRank);
  const canPass = hands[player].some(card =>
    !isPointCard(card.rank)
    && cardCost(card, trumpSuit, levelRank) < candidateCost
    && validateFollow(hands[player], lead, [card], trumpSuit, levelRank).ok);
  if (!canPass) return 0;

  // 当前大牌那一方的搭档（本墩受益者）无法再往这墩加分
  const beneficiary = player === third ? fourth : third;
  if (canAddPointsToTrick(
    hands[beneficiary], trick.leadDoor, trumpSuit, levelRank,
  )) {
    return 0;
  }

  return -PASS_POINT_CARD_PENALTY;
}

/** 生成同门内的所有拖拉机领出候选（长度 ≥ 2 对，含子段） */
function generateTractorLeadCandidates(
  doorCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[][] {
  const units = leadPairUnits(doorCards, trumpSuit, levelRank)
    .sort((a, b) => a.slot - b.slot);
  const runs: LeadPairUnit[][] = [];
  let current: LeadPairUnit[] = [];
  for (const unit of units) {
    if (current.length === 0
      || unit.slot === current[current.length - 1].slot + 1) {
      current.push(unit);
    }
    else {
      if (current.length >= 2) runs.push(current);
      current = [unit];
    }
  }
  if (current.length >= 2) runs.push(current);

  const candidates: Card[][] = [];
  for (const run of runs) {
    for (let length = 2; length <= run.length; length++) {
      for (let start = 0; start + length <= run.length; start++) {
        candidates.push(
          run.slice(start, start + length).flatMap(unit => unit.cards),
        );
      }
    }
  }
  return candidates;
}

/** 生成同门内的甩牌候选（最多 5 张，保留点数最低的若干组） */
function generateThrowLeadCandidates(
  doorCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[][] {
  const candidates: Card[][] = [];
  const maxSize = Math.min(MAX_THROW_LEAD_CARDS, doorCards.length);
  for (let size = 3; size <= maxSize; size++) {
    const combo: Card[] = [];
    const walk = (start: number) => {
      if (combo.length === size) {
        const shape = analyzeShape(combo, trumpSuit, levelRank);
        if (shape.type === HandType.Throw && shape.door !== null) {
          candidates.push([...combo]);
        }
        return;
      }
      for (let i = start; i < doorCards.length; i++) {
        combo.push(doorCards[i]);
        walk(i + 1);
        combo.pop();
      }
    };
    walk(0);
  }
  candidates.sort((a, b) => trickPoints(a) - trickPoints(b));
  return candidates.slice(0, MAX_THROW_LEAD_CANDIDATES);
}

/**
 * 评估「钓主」领出：领出对手可毙的副牌组合，主动消耗对手主牌。
 *
 * 只有同时满足下面条件才返回分数（否则返回 null，不进入候选）：
 *   1. 至少一名对手对该门缺门，且能用主牌合法毙掉这个牌型；
 *   2. 对家不在该对手之后形成反毙（否则结果不确定）。
 *
 * 分数 = 输掉本墩的基础分 + 对手主牌力 - 自己牌力 + 钓主加成。
 * 送分超过阈值时，额外按超出点数降权（如 K1010）。
 */
function scoreRuffBaitLead(
  cards: Card[],
  lead: HandShape,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number | null {
  if (lead.door === null || lead.door === 'trump') return null;

  const order = turnOrderFrom(player);
  const partner = order.find(
    pos => pos !== player && teamOf(pos) === teamOf(player),
  );
  if (!partner) return null;
  const partnerIndex = order.indexOf(partner);

  let ruffingOpponent: PlayerPosition | null = null;
  for (let i = 1; i < order.length; i++) {
    const pos = order[i];
    if (teamOf(pos) === teamOf(player)) continue;
    if (!canRuffWithTrump(hands[pos], lead, trumpSuit, levelRank)) continue;

    // 对家在这家之后、也能用主牌毙 → 结果不确定，不按「必被毙」估值
    if (i < partnerIndex
      && canRuffWithTrump(hands[partner], lead, trumpSuit, levelRank)) {
      return null;
    }
    ruffingOpponent = pos;
    break;
  }
  if (!ruffingOpponent) return null;

  const leadPoints = trickPoints(cards);
  const trumpsSpent = cards.length;
  const ownCost = cards.reduce(
    (sum, card) => sum + cardCost(card, trumpSuit, levelRank),
    0,
  );
  const opponentCost = cheapestRuffCost(
    hands[ruffingOpponent], lead, trumpSuit, levelRank,
  );
  let score = -TRICK_WIN_VALUE - leadPoints - ownCost + opponentCost;
  const limit = trumpsSpent * RUFF_BAIT_POINT_PER_TRUMP;
  if (leadPoints <= limit) {
    score += Math.min(trumpsSpent * TRUMP_DRAW_VALUE, RUFF_BAIT_MAX_BONUS);
  }
  else {
    // 送分过高：不仅不给钓主加成，还要额外降权（K1010 这类组合）
    score -= (leadPoints - limit) * RUFF_BAIT_OVER_POINT_PENALTY;
  }
  return score;
}

/**
 * 评估「必胜的多张领出」：
 *   - 对子：没有对手持有更大的同门对子（典型：KK，外面无 AA）；
 *   - A+K 甩牌：A 是该门最大牌，外面最多只有另一张 A 打平（先出者赢）。
 * 要求对手都不能用主牌毙。后三家使用 chooseFollow 估算；
 * 领先时他们无法改变赢家，只会影响本墩分数与牌力消耗。
 */
function scoreWinningMultiLead(
  cards: Card[],
  lead: HandShape,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number | null {
  if (lead.door === null || lead.door === 'trump') return null;

  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player));
  if (opponents.some(pos =>
    canRuffWithTrump(hands[pos], lead, trumpSuit, levelRank))) {
    return null;
  }

  const isAkThrow = lead.count === 2
    && cards.some(c => c.rank === Rank.Ace)
    && cards.some(c => c.rank === Rank.King);

  if (lead.type === HandType.Pair) {
    const slot = slotOf(cards[0], trumpSuit, levelRank);
    for (const pos of opponents) {
      const oppDoorCards = hands[pos].filter(
        c => doorOf(c, trumpSuit, levelRank) === lead.door,
      );
      const hasHigherPair = leadPairUnits(oppDoorCards, trumpSuit, levelRank)
        .some(unit => unit.slot > slot);
      if (hasHigherPair) return null;
    }
  }
  else if (!isAkThrow) {
    return null;
  }

  const captureBonus = isAkThrow && opponents.some(pos =>
    hands[pos].filter(c => doorOf(c, trumpSuit, levelRank) === lead.door).length === 2,
  )
    ? AK_CAPTURE_BONUS
    : 0;

  const plays: PlayState['trick']['plays'] = [{
    player,
    cards,
    handType: lead.type,
  }];
  const simHands: Hands = {
    ...hands,
    [player]: hands[player].filter(c => !cards.some(p => p.id === c.id)),
  };
  let turn = nextPlayer(player);
  for (let i = 0; i < 3; i++) {
    const follow = chooseFollow(simHands[turn], lead, trumpSuit, levelRank);
    if (follow.length !== lead.count) return null;
    plays.push({
      player: turn,
      cards: follow,
      handType: analyzeShape(follow, trumpSuit, levelRank).type,
    });
    simHands[turn] = simHands[turn].filter(
      c => !follow.some(p => p.id === c.id),
    );
    turn = nextPlayer(turn);
  }

  const winner = judgePlays(plays, lead, trumpSuit, levelRank);
  if (teamOf(winner) !== teamOf(player)) return null;

  const points = trickPoints(plays.flatMap(play => play.cards));
  const cardEconomy = plays.reduce((value, play) => {
    const cost = play.cards.reduce(
      (sum, card) => sum + cardCost(card, trumpSuit, levelRank),
      0,
    );
    return value + (teamOf(play.player) === teamOf(player) ? -cost : cost);
  }, 0);
  const isKingPair = lead.type === HandType.Pair
    && cards.length === 2
    && cards.every(c => c.rank === Rank.King);
  const pairBonus = isKingPair ? SAFE_PAIR_LEAD_BONUS : 0;
  return TRICK_WIN_VALUE + points + cardEconomy + captureBonus + pairBonus;
}

/**
 * 单张搜索中的钓主加成：本方领出的副牌被对手用主牌毙掉并大出时，
 * 按领出牌的点数 / 张数给予奖励。只在 ruffBait=true（本方领出）时调用。
 */
function ruffBaitBonus(
  plays: PlayState['trick']['plays'],
  winner: PlayerPosition,
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  if (lead.door === null || lead.door === 'trump') return 0;

  const winnerPlay = plays.find(play => play.player === winner);
  if (!winnerPlay) return 0;
  if (!winnerPlay.cards.every(c => doorOf(c, trumpSuit, levelRank) === 'trump')) {
    return 0;
  }

  const leadCards = plays[0].cards;
  const leadPoints = trickPoints(leadCards);
  const trumpsSpent = leadCards.length;
  const limit = trumpsSpent * RUFF_BAIT_POINT_PER_TRUMP;
  if (leadPoints <= limit) {
    return Math.min(trumpsSpent * TRUMP_DRAW_VALUE, RUFF_BAIT_MAX_BONUS);
  }
  return -(leadPoints - limit) * RUFF_BAIT_OVER_POINT_PENALTY;
}

function utility(
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  rootTeam: ReturnType<typeof teamOf>,
  trumpSuit: Suit | null,
  levelRank: Rank,
  leadBonus: number,
  leading: boolean,
  strategicBonus: number,
): number {
  const winner = judgePlays(plays, lead, trumpSuit, levelRank);
  const points = trickPoints(plays.flatMap(play => play.cards));
  const won = teamOf(winner) === rootTeam;
  const cardEconomy = plays.reduce((value, play) => {
    const cost = play.cards.reduce(
      (sum, card) => sum + cardCost(card, trumpSuit, levelRank),
      0,
    );
    return value + (teamOf(play.player) === rootTeam ? -cost : cost);
  }, 0);

  const base = (won ? TRICK_WIN_VALUE + points : -TRICK_WIN_VALUE - points) + cardEconomy;
  let score = base + strategicBonus;
  if (won) score += leadBonus;
  else if (leading) score += ruffBaitBonus(plays, winner, lead, trumpSuit, levelRank);
  if (leading) {
    score -= leadTrumpPointJokerPenalty(
      plays, lead, winner, rootTeam, points, trumpSuit, levelRank,
    );
  }
  return score;
}

function searchTrick(
  hands: Hands,
  turn: PlayerPosition,
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  rootTeam: ReturnType<typeof teamOf>,
  trumpSuit: Suit | null,
  levelRank: Rank,
  leadBonus: number,
  leading: boolean,
  strategicBonus: number,
  alpha: number,
  beta: number,
): number {
  if (plays.length === 4) {
    return utility(
      plays, lead, rootTeam, trumpSuit, levelRank, leadBonus, leading, strategicBonus,
    );
  }

  const available = hands[turn];
  const maximizing = teamOf(turn) === rootTeam;
  let best = maximizing ? -Infinity : Infinity;

  for (const card of available) {
    if (!validateFollow(available, lead, [card], trumpSuit, levelRank).ok) continue;

    const nextHands: Hands = {
      ...hands,
      [turn]: available.filter(candidate => candidate.id !== card.id),
    };
    const nextPlays = [...plays, {
      player: turn,
      cards: [card],
      handType: HandType.Single,
    }];
    const score = searchTrick(
      nextHands,
      nextPlayer(turn),
      nextPlays,
      lead,
      rootTeam,
      trumpSuit,
      levelRank,
      leadBonus,
      leading,
      strategicBonus,
      alpha,
      beta,
    );

    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    }
    else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) break;
  }

  return best;
}

// ------------------------------------------------------------
// 多张领出（对子 / 拖拉机 / 甩牌）的评估
// ------------------------------------------------------------

/** 该门内所有长度为 length 的连续对子段（构造跟牌用） */
function pairRunsOfLength(
  units: LeadPairUnit[],
  length: number,
): LeadPairUnit[][] {
  if (length < 2 || units.length < length) return [];
  const bySlot = new Map<number, LeadPairUnit>();
  for (const unit of units) {
    if (!bySlot.has(unit.slot)) bySlot.set(unit.slot, unit);
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
  const runs: LeadPairUnit[][] = [];
  for (let i = 0; i + length <= slots.length; i++) {
    let ok = true;
    for (let j = 1; j < length; j++) {
      if (slots[i + j] !== slots[i + j - 1] + 1) {
        ok = false;
        break;
      }
    }
    if (ok) runs.push(slots.slice(i, i + length).map(s => bySlot.get(s)!));
  }
  return runs;
}

interface BuildFollowOptions {
  /** 尽量取大（跟牌抢大 / 毙牌）还是取小（垫牌） */
  high: boolean;
  /** 补牌只用主牌凑（构造毙牌） */
  trumpsOnly?: boolean;
  /** 补牌优先出分牌（对家大时垫分） */
  dumpPoints?: boolean;
}

/**
 * 构造一手合法的跟牌（多张领出模拟用）。
 *
 * - 该门够：门内选牌，并满足「有对必对 / 有拖必拖」；
 * - 该门不足：门内牌全出，其余按 `options` 补齐（补牌不限牌型）。
 * 构造不出合法牌时返回 null。
 */
function buildFollow(
  hand: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
  options: BuildFollowOptions,
): Card[] | null {
  const door = lead.door;
  if (door === null) return null;
  const need = lead.count;
  const inDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) === door);
  const cost = (c: Card) => cardCost(c, trumpSuit, levelRank);
  const order = (a: Card, b: Card) => (options.high ? cost(b) - cost(a) : cost(a) - cost(b));

  // ---- 该门够：门内选牌，必须满足对子 / 拖拉机要求 ----
  if (inDoor.length >= need) {
    const picked: Card[] = [];
    const used = new Set<string>();
    const take = (cards: Card[]) => {
      for (const c of cards) {
        if (used.has(c.id)) continue;
        used.add(c.id);
        picked.push(c);
      }
    };

    const units = leadPairUnits(inDoor, trumpSuit, levelRank)
      .sort((a, b) => (options.high ? b.slot - a.slot : a.slot - b.slot));

    if (lead.tractor >= 2 && need >= lead.tractor * 2) {
      const runs = pairRunsOfLength(units, lead.tractor);
      if (runs.length > 0) {
        take((options.high ? runs[runs.length - 1] : runs[0]).flatMap(u => u.cards));
      }
    }
    if (lead.pairs >= 1) {
      const needPairs = Math.min(lead.pairs, units.length, Math.floor(need / 2));
      for (const unit of units) {
        if (picked.length >= needPairs * 2) break;
        take(unit.cards);
      }
    }

    // 补齐：先整对（不拆对子），再单张
    const rest = inDoor.filter(c => !used.has(c.id));
    const restUnits = leadPairUnits(rest, trumpSuit, levelRank);
    const unitIds = new Set(restUnits.flatMap(u => u.cards.map(c => c.id)));
    const restUnitsSorted = [...restUnits]
      .sort((a, b) => (options.high ? b.slot - a.slot : a.slot - b.slot));
    const ordered = [
      ...restUnitsSorted.flatMap(u => u.cards),
      ...rest.filter(c => !unitIds.has(c.id)).sort(order),
    ];
    for (const c of ordered) {
      if (picked.length >= need) break;
      take([c]);
    }
    if (picked.length < need) return null;
    const play = picked.slice(0, need);
    return validateFollow(hand, lead, play, trumpSuit, levelRank).ok ? play : null;
  }

  // ---- 该门不足：门内牌全出，其余自选 ----
  const picked = [...inDoor];
  const used = new Set(picked.map(c => c.id));
  const outDoor = hand.filter(c => !used.has(c.id));
  const side = outDoor
    .filter(c => doorOf(c, trumpSuit, levelRank) !== 'trump')
    .sort(order);
  const trumps = outDoor
    .filter(c => doorOf(c, trumpSuit, levelRank) === 'trump')
    .sort(order);

  let fillers: Card[];
  if (options.trumpsOnly) {
    fillers = trumps;
  }
  else if (options.dumpPoints) {
    const points = outDoor.filter(c => isPointCard(c.rank)).sort(order);
    const others = outDoor.filter(c => !isPointCard(c.rank)).sort(order);
    fillers = [...points, ...others];
  }
  else {
    fillers = options.high ? [...trumps, ...side] : [...side, ...trumps];
  }

  const play = [...picked, ...fillers.slice(0, need - picked.length)];
  if (play.length !== need) return null;
  return validateFollow(hand, lead, play, trumpSuit, levelRank).ok ? play : null;
}

/**
 * 某家对多张领出的候选跟牌（数量很少：最省、最强、垫分、毙牌）。
 *
 * 多张领出的完整枚举会爆炸（该门缺门时可以垫任意牌），
 * 这里只取几种典型应对，足够评估领出这一墩的得失。
 */
function followOptionsFor(
  hand: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[][] {
  const door = lead.door;
  if (door === null) return [];
  const need = lead.count;
  const inDoor = hand.filter(c => doorOf(c, trumpSuit, levelRank) === door);

  const options: Card[][] = [];
  const seen = new Set<string>();
  const add = (cards: Card[] | null) => {
    if (!cards || cards.length !== need) return;
    if (!validateFollow(hand, lead, cards, trumpSuit, levelRank).ok) return;
    const key = cards.map(c => c.id).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    options.push(cards);
  };

  add(chooseFollow(hand, lead, trumpSuit, levelRank));
  add(buildFollow(hand, lead, trumpSuit, levelRank, { high: true }));

  if (inDoor.length < need) {
    add(buildFollow(hand, lead, trumpSuit, levelRank, { high: false, dumpPoints: true }));
    if (inDoor.length === 0) {
      add(buildFollow(hand, lead, trumpSuit, levelRank, { high: false, trumpsOnly: true }));
      add(buildFollow(hand, lead, trumpSuit, levelRank, { high: true, trumpsOnly: true }));
    }
  }
  return options;
}

/**
 * 多张领出的通用评估（完美信息、一棵很小的极小化搜索）。
 *
 * 之前只有「钓主」和「必胜对子 / AK 甩牌」两种多张领出会被评分，
 * 所以 AI 几乎不会主动领出对子、拖拉机和普通甩牌。
 * 这里用与单张搜索同样的 `utility`（赢墩价值 + 墩分 + 牌力消耗）对候选打分，
 * 让对子 / 拖拉机 / 甩牌和单张公平竞争。
 */
function scoreMultiLead(
  cards: Card[],
  lead: HandShape,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  const rootTeam = teamOf(player);
  const startHands: Hands = {
    ...hands,
    [player]: hands[player].filter(c => !cards.some(x => x.id === c.id)),
  };
  const firstPlay = { player, cards, handType: lead.type };

  const search = (
    currentHands: Hands,
    turn: PlayerPosition,
    plays: PlayState['trick']['plays'],
    alpha: number,
    beta: number,
  ): number => {
    if (plays.length === ALL_POSITIONS.length) {
      return utility(plays, lead, rootTeam, trumpSuit, levelRank, 0, false, 0);
    }

    const options = followOptionsFor(currentHands[turn], lead, trumpSuit, levelRank);
    if (options.length === 0) {
      return utility(plays, lead, rootTeam, trumpSuit, levelRank, 0, false, 0);
    }

    const maximizing = teamOf(turn) === rootTeam;
    let best = maximizing ? -Infinity : Infinity;
    for (const option of options) {
      const nextHands: Hands = {
        ...currentHands,
        [turn]: currentHands[turn].filter(c => !option.some(x => x.id === c.id)),
      };
      const nextPlays = [...plays, {
        player: turn,
        cards: option,
        handType: analyzeShape(option, trumpSuit, levelRank).type,
      }];
      const score = search(nextHands, nextPlayer(turn), nextPlays, alpha, beta);
      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      }
      else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (alpha >= beta) break;
    }
    return best;
  };

  return search(startHands, nextPlayer(player), [firstPlay], -Infinity, Infinity);
}

/**
 * 选择着法。
 *
 * 单张墩使用完美信息搜索；多张领出（对子 / 拖拉机 / 甩牌）先用
 * 「钓主」「必胜」两种专项规则评分，没有命中时用 `scoreMultiLead`
 * 做通用评估。多张跟牌仍使用基础合法策略。
 */
export function aiChoosePlay(
  state: PlayState,
  hands: Hands,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  const player = state.turn;
  const hand = hands[player];

  if (!state.trick.leadDoor && state.trick.plays.length === 0) {
    let bestCards: Card[] | null = null;
    let bestScore = -Infinity;
    const rootTeam = teamOf(player);

    for (const card of hand) {
      const lead = analyzeShape([card], trumpSuit, levelRank);
      const firstPlay = {
        player,
        cards: [card],
        handType: HandType.Single,
      };
      const remainingHands: Hands = {
        ...hands,
        [player]: hand.filter(candidate => candidate.id !== card.id),
      };
      const leadBonus = safePointLeadBonus(card, hands, player, trumpSuit, levelRank);
      const splitBonus = splitKingLeadBonus(card, hands, player, trumpSuit, levelRank);
      const strategicBonus = splitBonus
        - leadJokerPenalty(card, trumpSuit, levelRank);
      const score = searchTrick(
        remainingHands,
        nextPlayer(player),
        [firstPlay],
        lead,
        rootTeam,
        trumpSuit,
        levelRank,
        leadBonus,
        true,
        strategicBonus,
        bestScore,
        Infinity,
      );
      if (score > bestScore) {
        bestScore = score;
        bestCards = [card];
      }
    }

    // 多张领出候选：对子 / 拖拉机 / 甩牌（含主牌门）。
    // 先按「钓主」「必胜」两个专项规则评分，没命中时用通用评估与单张公平竞争。
    const otherHands = ALL_POSITIONS
      .filter(pos => pos !== player)
      .map(pos => hands[pos]);
    const leadDoors = new Set<Suit | 'trump'>();
    for (const card of hand) {
      leadDoors.add(doorOf(card, trumpSuit, levelRank));
    }

    const seen = new Set<string>();
    for (const door of leadDoors) {
      const isTrumpDoor = door === 'trump';
      const doorCards = hand.filter(
        card => doorOf(card, trumpSuit, levelRank) === door,
      );
      const akThrows: Card[][] = [];
      if (!isTrumpDoor) {
        const aces = doorCards.filter(card => card.rank === Rank.Ace);
        const kings = doorCards.filter(card => card.rank === Rank.King);
        for (const ace of aces) {
          for (const king of kings) {
            akThrows.push([ace, king]);
          }
        }
      }
      // 主牌门只考虑对子 / 拖拉机（吊主），不生成主牌甩牌
      const candidates: Card[][] = [
        ...leadPairUnits(doorCards, trumpSuit, levelRank)
          .map(unit => unit.cards),
        ...generateTractorLeadCandidates(doorCards, trumpSuit, levelRank),
        ...(isTrumpDoor
          ? []
          : [
              ...generateThrowLeadCandidates(doorCards, trumpSuit, levelRank),
              ...akThrows,
            ]),
      ];

      for (const cards of candidates) {
        const key = cards.map(card => card.id).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const lead = analyzeShape(cards, trumpSuit, levelRank);
        if (lead.door === null) continue;
        // 甩牌会被三家拦住时自动出小，不作为钓主候选
        if (lead.type === HandType.Throw
          && throwFallback(cards, otherHands, trumpSuit, levelRank) !== null) {
          continue;
        }

        const ruffBaitScore = scoreRuffBaitLead(
          cards, lead, hands, player, trumpSuit, levelRank,
        );
        // 保留惩罚：主牌多张领出同样不该交出王；空甩一对 A 也降低评级
        const holdPenalty = cards.reduce(
          (sum, card) => sum + leadJokerPenalty(card, trumpSuit, levelRank), 0,
        ) + acePairLeadPenalty(cards, lead, hands, player, trumpSuit, levelRank);
        const score = ruffBaitScore !== null
          ? ruffBaitScore
          : (scoreWinningMultiLead(cards, lead, hands, player, trumpSuit, levelRank)
            ?? scoreMultiLead(cards, lead, hands, player, trumpSuit, levelRank))
            - holdPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestCards = cards;
        }
      }
    }

    return bestCards ?? chooseLead(hand, trumpSuit, levelRank);
  }

  if (state.trick.leadCount === 1) {
    const lead: HandShape = {
      type: state.trick.leadType,
      door: state.trick.leadDoor,
      count: state.trick.leadCount,
      pairs: state.trick.leadPairs,
      tractor: state.trick.leadTractor,
      maxTractor: state.trick.leadMaxTractor,
    };
    const rootTeam = teamOf(player);
    let bestCard: Card | null = null;
    let bestScore = -Infinity;

    for (const card of hand) {
      if (!validateFollow(hand, lead, [card], trumpSuit, levelRank).ok) continue;

      const play = {
        player,
        cards: [card],
        handType: HandType.Single,
      };
      const remainingHands: Hands = {
        ...hands,
        [player]: hand.filter(candidate => candidate.id !== card.id),
      };
      const strategicBonus = pointCardPassPenalty(
        state, hands, player, trumpSuit, levelRank, card,
      ) - breakStructurePenalty(card, hands[player], trumpSuit, levelRank)
        - bigTrumpEmptyTrickPenalty(state, lead, card, trumpSuit, levelRank)
        - pointFeedBigTrumpPenalty(
          state, hands, player, lead, card, trumpSuit, levelRank,
        )
        - giveAwayDoorBossPenalty(
          card, hands[player], hands, player, trumpSuit, levelRank,
        );
      const score = searchTrick(
        remainingHands,
        nextPlayer(player),
        [...state.trick.plays, play],
        lead,
        rootTeam,
        trumpSuit,
        levelRank,
        0,
        false,
        strategicBonus,
        bestScore,
        Infinity,
      );
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    return bestCard ? [bestCard] : chooseFollow(hand, lead, trumpSuit, levelRank);
  }

  const lead: HandShape = {
    type: state.trick.leadType,
    door: state.trick.leadDoor,
    count: state.trick.leadCount,
    pairs: state.trick.leadPairs,
    tractor: state.trick.leadTractor,
    maxTractor: state.trick.leadMaxTractor,
  };
  // 多张跟牌：对家基本大出时把分牌垫给对家；
  // 否则先按合法最小策略出，再把白送出去的门霸换成同门的 5。
  if (partnerLikelyWins(state, hands, player, lead, trumpSuit, levelRank)) {
    return chooseFollow(
      hand,
      lead,
      trumpSuit,
      levelRank,
      makeFeedPointsOrder(hands, player, trumpSuit, levelRank),
    );
  }
  return keepDoorBossInFollow(
    chooseFollow(hand, lead, trumpSuit, levelRank),
    hand,
    lead,
    hands,
    player,
    trumpSuit,
    levelRank,
  );
}
