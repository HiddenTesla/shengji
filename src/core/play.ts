// ============================================================
// 出牌（打牌）—— 步骤 1：最基础跟牌
//
// 本步刻意放宽规则（后续步骤逐步收紧）：
//   - 领出：只要求「同一门」即可，张数不限
//   - 跟出：只要求张数与首出一致，不管门与合法性
//   - 不计分
//   - 永远是领出者赢（不做大小判断）
// ============================================================

import {
  type Card,
  type PlayedCards,
  type PlayerPosition,
  type Rank,
  type Suit,
  type Trick,
  ALL_POSITIONS,
  HandType,
  nextPlayer,
} from './types.ts'
import { isTrump } from './trump.ts'

/** 四家手牌 */
export type Hands = Record<PlayerPosition, Card[]>

/** 门：主牌门（'trump'）或某个副花色 */
export type Door = Suit | 'trump'

/** 判定一张牌属于哪一门 */
export function doorOf(
  card: Card,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Door {
  return isTrump(card, trumpSuit, levelRank) ? 'trump' : card.suit
}

/** 门的显示名 */
export function doorLabel(door: Door): string {
  return door === 'trump' ? '主牌' : `${door}`
}

/** 本墩出牌状态 */
export interface TrickState {
  leadPlayer: PlayerPosition
  /** 首出的门（null = 本墩尚未首出） */
  leadDoor: Door | null
  /** 首出张数 */
  leadCount: number
  /** 首出牌型（步骤 1 仅作展示用） */
  leadType: HandType
  /** 本墩出牌记录（按顺序） */
  plays: PlayedCards[]
  /** 四家是否已出完（等待收墩） */
  complete: boolean
  /** 本墩赢家（收墩时确定） */
  winner: PlayerPosition | null
}

/** 出牌阶段整体状态 */
export interface PlayState {
  /** 轮到谁出牌 */
  turn: PlayerPosition
  /** 当前墩 */
  trick: TrickState
  /** 已收的墩 */
  tricks: Trick[]
}

/** 出牌结果 */
export interface PlayResult {
  hands: Hands
  state: PlayState
  /** 本局是否结束（手牌全部出完） */
  roundOver: boolean
}

// ------------------------------------------------------------
// 创建 / 查询
// ------------------------------------------------------------

function emptyTrick(leadPlayer: PlayerPosition): TrickState {
  return {
    leadPlayer,
    leadDoor: null,
    leadCount: 0,
    leadType: HandType.Single,
    plays: [],
    complete: false,
    winner: null,
  }
}

/** 开局：首家（庄家）领出 */
export function createPlayState(leader: PlayerPosition): PlayState {
  return {
    turn: leader,
    trick: emptyTrick(leader),
    tricks: [],
  }
}

/** 当前墩是否等待首出 */
export function isLeading(state: PlayState): boolean {
  return state.trick.leadDoor === null
}

/**
 * 牌型（步骤 1 的宽松版：仅供展示）
 * 后续步骤 4 会用完整规则替换。
 */
export function shapeOf(cards: Card[]): HandType {
  if (cards.length === 1) return HandType.Single
  if (cards.length === 2) {
    return cards[0].rank === cards[1].rank ? HandType.Pair : HandType.Throw
  }
  return HandType.Throw
}

// ------------------------------------------------------------
// 合法性（步骤 1：最宽松）
// ------------------------------------------------------------

export interface PlayValidation {
  ok: boolean
  reason?: string
}

/**
 * 校验一次出牌（步骤 1）
 *   - 领出：所有牌必须同一门
 *   - 跟出：张数必须与首出相同
 */
export function validatePlay(
  state: PlayState,
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayValidation {
  if (cards.length === 0) {
    return { ok: false, reason: '请先选牌' }
  }

  const { trick } = state

  if (isLeading(state)) {
    const door = doorOf(cards[0], trumpSuit, levelRank)
    const mixed = cards.some(c => doorOf(c, trumpSuit, levelRank) !== door)
    if (mixed) {
      return { ok: false, reason: '领出必须同一门（主牌算一门）' }
    }
    return { ok: true }
  }

  if (cards.length !== trick.leadCount) {
    return { ok: false, reason: `需出 ${trick.leadCount} 张（首出 ${trick.leadCount} 张）` }
  }
  return { ok: true }
}

// ------------------------------------------------------------
// 大小判断（步骤 1：永远是领出者大）
// ------------------------------------------------------------

/** 判定本墩赢家（步骤 1：恒为首出者） */
export function judgeTrick(trick: TrickState): PlayerPosition {
  return trick.leadPlayer
}

// ------------------------------------------------------------
// 出牌 / 收墩
// ------------------------------------------------------------

/** 从手牌中移除已出的牌 */
function removeCards(hand: Card[], cards: Card[]): Card[] {
  const ids = new Set(cards.map(c => c.id))
  return hand.filter(c => !ids.has(c.id))
}

/**
 * 出牌：把 cards 从 player 手中打出，并推进状态
 *
 * 四家出完时把本墩标记为 complete（等待收墩）。
 */
export function applyPlay(
  hands: Hands,
  state: PlayState,
  player: PlayerPosition,
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayResult {
  const newHands: Hands = {
    ...hands,
    [player]: removeCards(hands[player], cards),
  }

  const play: PlayedCards = { player, cards, handType: shapeOf(cards) }
  const trick: TrickState = { ...state.trick, plays: [...state.trick.plays, play] }

  // 首家出牌 → 记录首出信息
  if (trick.leadDoor === null) {
    trick.leadDoor = doorOf(cards[0], trumpSuit, levelRank)
    trick.leadCount = cards.length
    trick.leadType = play.handType
  }

  // 四家出完 → 等待收墩
  if (trick.plays.length === ALL_POSITIONS.length) {
    trick.complete = true
    trick.winner = judgeTrick(trick)
    return {
      hands: newHands,
      state: { ...state, trick },
      roundOver: false,
    }
  }

  return {
    hands: newHands,
    state: { ...state, turn: nextPlayer(player), trick },
    roundOver: false,
  }
}

/** 收墩：结算赢家，开始下一墩；若手牌已空则本局结束 */
export function collectTrick(hands: Hands, state: PlayState): PlayResult {
  const winner = state.trick.winner ?? state.trick.leadPlayer
  const collected: Trick = {
    plays: state.trick.plays,
    leadPlayer: state.trick.leadPlayer,
    winner,
    // 步骤 1 不计分
    points: 0,
  }

  const roundOver = ALL_POSITIONS.every(p => hands[p].length === 0)

  return {
    hands,
    state: {
      turn: winner,
      trick: emptyTrick(winner),
      tricks: [...state.tricks, collected],
    },
    roundOver,
  }
}

// ------------------------------------------------------------
// 托管 AI（步骤 1：最简策略）
// ------------------------------------------------------------

function byRankAsc(a: Card, b: Card): number {
  return a.rank - b.rank
}

/**
 * AI 选择出牌（步骤 1）
 *   - 领出：优先出副牌中最小的一张
 *   - 跟出：优先出该门最小的牌，不足则用其它门补齐
 */
export function aiChoosePlay(
  state: PlayState,
  hand: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[] {
  if (isLeading(state)) {
    const sideCards = hand.filter(c => doorOf(c, trumpSuit, levelRank) !== 'trump')
    const pool = sideCards.length > 0 ? sideCards : hand
    return [[...pool].sort(byRankAsc)[0]]
  }

  const need = state.trick.leadCount
  const inDoor = hand
    .filter(c => doorOf(c, trumpSuit, levelRank) === state.trick.leadDoor)
    .sort(byRankAsc)
  const picked = inDoor.slice(0, need)
  if (picked.length >= need) return picked

  const pickedIds = new Set(picked.map(c => c.id))
  const rest = hand.filter(c => !pickedIds.has(c.id)).sort(byRankAsc)
  return [...picked, ...rest.slice(0, need - picked.length)]
}
