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
  nextPlayer,
  teamOf,
} from './types.ts'
import {
  type HandShape,
  analyzeShape,
  chooseFollow,
  chooseLead,
  doorOf,
  slotOf,
  validateFollow,
} from './hand.ts'
import { judgePlays } from './trick.ts'
import { trickPoints } from './scoring.ts'
import type { Hands, PlayState } from './play.ts'

const TRICK_WIN_VALUE = 1000

/**
 * 「安全 K」领出加成。
 *
 * 副牌 K（且不是级牌）在满足下面两点时，实际上是该门最高牌：
 *   1. 两名对手都没有该门的 A；
 *   2. 没有「该门缺门且手里有主牌」的对手（否则 K 可能被毙）。
 *
 * 此时领 K 可以稳收 10 分，同时把无分的 A 留在手里继续控制该门。
 * 加成只在真的赢下本墩时兑现（见 utility）。
 *
 * 60 足以压过单张墩内最多约 40 分的分差，但远小于赢 / 输墩的 ±1000，
 * 因此只会改变「都能赢时先出哪张」的排序，不会去抢赢不了的墩。
 */
const SAFE_KING_LEAD_BONUS = 60

function safeKingLeadBonus(
  card: Card,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  // K 为级牌时是主牌，本技巧不适用
  if (card.rank !== Rank.King || card.rank === levelRank) return 0

  const door = doorOf(card, trumpSuit, levelRank)
  if (door === 'trump') return 0

  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player))
  for (const pos of opponents) {
    const hand = hands[pos]
    // 对手手里有该门 A → K 不是最高牌
    if (hand.some(c => doorOf(c, trumpSuit, levelRank) === door && c.rank === Rank.Ace)) {
      return 0
    }
    // 对手该门缺门且手里还有主牌 → 可能直接毙掉 K
    const hasDoor = hand.some(c => doorOf(c, trumpSuit, levelRank) === door)
    const canRuff = hand.some(c => doorOf(c, trumpSuit, levelRank) === 'trump')
    if (!hasDoor && canRuff) {
      return 0
    }
  }

  return SAFE_KING_LEAD_BONUS
}

function cardCost(card: Card, trumpSuit: Suit | null, levelRank: Rank): number {
  const slot = slotOf(card, trumpSuit, levelRank)
  return doorOf(card, trumpSuit, levelRank) === 'trump' ? 20 + slot : slot
}

function utility(
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  rootTeam: ReturnType<typeof teamOf>,
  trumpSuit: Suit | null,
  levelRank: Rank,
  leadBonus: number,
): number {
  const winner = judgePlays(plays, lead, trumpSuit, levelRank)
  const points = trickPoints(plays.flatMap(play => play.cards))
  const won = teamOf(winner) === rootTeam
  const cardEconomy = plays.reduce((value, play) => {
    const cost = play.cards.reduce(
      (sum, card) => sum + cardCost(card, trumpSuit, levelRank),
      0,
    )
    return value + (teamOf(play.player) === rootTeam ? -cost : cost)
  }, 0)

  const base = (won ? TRICK_WIN_VALUE + points : -TRICK_WIN_VALUE - points) + cardEconomy
  // 安全 K 的加成只在真的赢下本墩时兑现
  return base + (won ? leadBonus : 0)
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
  alpha: number,
  beta: number,
): number {
  if (plays.length === 4) {
    return utility(plays, lead, rootTeam, trumpSuit, levelRank, leadBonus)
  }

  const available = hands[turn]
  const maximizing = teamOf(turn) === rootTeam
  let best = maximizing ? -Infinity : Infinity

  for (const card of available) {
    if (!validateFollow(available, lead, [card], trumpSuit, levelRank).ok) continue

    const nextHands: Hands = {
      ...hands,
      [turn]: available.filter(candidate => candidate.id !== card.id),
    }
    const nextPlays = [...plays, {
      player: turn,
      cards: [card],
      handType: HandType.Single,
    }]
    const score = searchTrick(
      nextHands,
      nextPlayer(turn),
      nextPlays,
      lead,
      rootTeam,
      trumpSuit,
      levelRank,
      leadBonus,
      alpha,
      beta,
    )

    if (maximizing) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    }
    else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }
    if (alpha >= beta) break
  }

  return best
}

/**
 * 选择单张墩的完美信息着法。
 *
 * 每一队都按当前墩收益最优地配合；先比较能否拿下当前墩及其分数，
 * 再比较各队为此消耗的牌力。多张墩仍使用基础合法策略。
 */
export function aiChoosePlay(
  state: PlayState,
  hands: Hands,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  const player = state.turn
  const hand = hands[player]

  if (!state.trick.leadDoor && state.trick.plays.length === 0) {
    let bestCard: Card | null = null
    let bestScore = -Infinity
    const rootTeam = teamOf(player)

    for (const card of hand) {
      const lead = analyzeShape([card], trumpSuit, levelRank)
      const firstPlay = {
        player,
        cards: [card],
        handType: HandType.Single,
      }
      const remainingHands: Hands = {
        ...hands,
        [player]: hand.filter(candidate => candidate.id !== card.id),
      }
      const leadBonus = safeKingLeadBonus(card, hands, player, trumpSuit, levelRank)
      const score = searchTrick(
        remainingHands,
        nextPlayer(player),
        [firstPlay],
        lead,
        rootTeam,
        trumpSuit,
        levelRank,
        leadBonus,
        bestScore,
        Infinity,
      )
      if (score > bestScore) {
        bestScore = score
        bestCard = card
      }
    }
    return bestCard ? [bestCard] : chooseLead(hand, trumpSuit, levelRank)
  }

  if (state.trick.leadCount === 1) {
    const lead: HandShape = {
      type: state.trick.leadType,
      door: state.trick.leadDoor,
      count: state.trick.leadCount,
      pairs: state.trick.leadPairs,
      tractor: state.trick.leadTractor,
    }
    const rootTeam = teamOf(player)
    let bestCard: Card | null = null
    let bestScore = -Infinity

    for (const card of hand) {
      if (!validateFollow(hand, lead, [card], trumpSuit, levelRank).ok) continue

      const play = {
        player,
        cards: [card],
        handType: HandType.Single,
      }
      const remainingHands: Hands = {
        ...hands,
        [player]: hand.filter(candidate => candidate.id !== card.id),
      }
      const score = searchTrick(
        remainingHands,
        nextPlayer(player),
        [...state.trick.plays, play],
        lead,
        rootTeam,
        trumpSuit,
        levelRank,
        0,
        bestScore,
        Infinity,
      )
      if (score > bestScore) {
        bestScore = score
        bestCard = card
      }
    }

    return bestCard ? [bestCard] : chooseFollow(hand, lead, trumpSuit, levelRank)
  }

  const lead: HandShape = {
    type: state.trick.leadType,
    door: state.trick.leadDoor,
    count: state.trick.leadCount,
    pairs: state.trick.leadPairs,
    tractor: state.trick.leadTractor,
  }
  return chooseFollow(hand, lead, trumpSuit, levelRank)
}
