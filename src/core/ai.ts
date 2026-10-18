// ============================================================
// 完美信息 AI：基于四家可见手牌，对当前单张墩做极小化搜索
// ============================================================

import {
  type Card,
  type PlayerPosition,
  type Rank,
  type Suit,
  HandType,
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

  return (won ? TRICK_WIN_VALUE + points : -TRICK_WIN_VALUE - points) + cardEconomy
}

function searchTrick(
  hands: Hands,
  turn: PlayerPosition,
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  rootTeam: ReturnType<typeof teamOf>,
  trumpSuit: Suit | null,
  levelRank: Rank,
  alpha: number,
  beta: number,
): number {
  if (plays.length === 4) {
    return utility(plays, lead, rootTeam, trumpSuit, levelRank)
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
      const score = searchTrick(
        remainingHands,
        nextPlayer(player),
        [firstPlay],
        lead,
        rootTeam,
        trumpSuit,
        levelRank,
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
