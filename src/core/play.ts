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
import {
  type Door,
  type HandShape,
  type PlayValidation,
  analyzeShape,
  throwFallback,
  validateFollow,
  validateLead,
} from './hand.ts'
import { beats, judgePlays } from './trick.ts'
import {
  type BottomSettlement,
  accumulate,
  settleBottom,
  trickPoints,
} from './scoring.ts'

/** 四家手牌 */
export type Hands = Record<PlayerPosition, Card[]>

// 门相关工具已移入 hand.ts，这里再导出以兼容既有引用
export { doorOf, doorLabel } from './hand.ts'
export type { Door } from './hand.ts'
export type { PlayValidation } from './hand.ts'
export { aiChoosePlay } from './ai.ts'

/** 本墩出牌状态 */
export interface TrickState {
  leadPlayer: PlayerPosition
  /** 首出的门（null = 本墩尚未首出） */
  leadDoor: Door | null
  /** 首出张数 */
  leadCount: number
  /** 首出牌型（步骤 1 仅作展示用） */
  leadType: HandType
  /** 首出含有的对子数 */
  leadPairs: number
  /** 首出拖拉机长度（对数，0 = 非拖拉机） */
  leadTractor: number
  /** 首出为甩牌且已被三家管住（**出牌之后**判定；此时已按「自动出小」改出） */
  throwBlocked: boolean
  /** 甩牌失败时，原本想甩的牌（本墩内展示用；空数组 = 未失败） */
  throwAttempt: Card[]
  /** 本墩出牌记录（按顺序） */
  plays: PlayedCards[]
  /** 四家是否已出完（等待收墩） */
  complete: boolean
  /** 本墩赢家（收墩时确定） */
  winner: PlayerPosition | null
}

/** 出牌阶段整体状态 */
export interface PlayState {
  /** 庄家（用于区分闲家 / 庄家队伍计分） */
  banker: PlayerPosition
  /** 轮到谁出牌 */
  turn: PlayerPosition
  /** 当前墩 */
  trick: TrickState
  /** 已收的墩 */
  tricks: Trick[]
  /** 闲家（进攻方）得分（收墩所得；若抠底，末墩结算时已加上「底牌分 × 倍数」） */
  defendingPoints: number
  /** 庄家（防守方）逃分 */
  bankerPoints: number
  /** 底牌结算（最后一墩收完后才有值；未结束为 null） */
  bottom: BottomSettlement | null
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
    leadPairs: 0,
    leadTractor: 0,
    throwBlocked: false,
    throwAttempt: [],
    plays: [],
    complete: false,
    winner: null,
  }
}

/** 开局：庄家领出第一墩 */
export function createPlayState(banker: PlayerPosition): PlayState {
  return {
    banker,
    turn: banker,
    trick: emptyTrick(banker),
    tricks: [],
    defendingPoints: 0,
    bankerPoints: 0,
    bottom: null,
  }
}

/** 当前墩是否等待首出 */
export function isLeading(state: PlayState): boolean {
  return state.trick.leadDoor === null
}

/** 取某一家的其余三家手牌（甩牌合法性判定用） */
export function otherHands(hands: Hands, player: PlayerPosition): Card[][] {
  return ALL_POSITIONS.filter(p => p !== player).map(p => hands[p])
}

/**
 * 校验一次出牌（出牌前的「能不能这样出」，**不含**甩牌是否被管）
 *   - 领出：同一门
 *   - 跟出：有此门必跟、有对必对、有拖必拖、该门不足时先出完再垫/毙
 *
 * 注：甩牌合法性不在出牌前判定（否则会泄露其余三家手牌），
 *     而在 `applyPlay` 出牌后判定并记入 `trick.throwBlocked`。
 */
export function validatePlay(
  state: PlayState,
  hand: Card[],
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayValidation {
  if (cards.length === 0) {
    return { ok: false, reason: '请先选牌' }
  }

  if (isLeading(state)) {
    return validateLead(cards, trumpSuit, levelRank)
  }

  const { trick } = state
  const lead: HandShape = {
    type: trick.leadType,
    door: trick.leadDoor,
    count: trick.leadCount,
    pairs: trick.leadPairs,
    tractor: trick.leadTractor,
  }
  return validateFollow(hand, lead, cards, trumpSuit, levelRank)
}

// ------------------------------------------------------------
// 大小判断（步骤 5：见 trick.ts）
// ------------------------------------------------------------

/** 判定本墩赢家 */
export function judgeTrick(
  trick: TrickState,
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayerPosition {
  const lead: HandShape = {
    type: trick.leadType,
    door: trick.leadDoor,
    count: trick.leadCount,
    pairs: trick.leadPairs,
    tractor: trick.leadTractor,
  }
  return judgePlays(trick.plays, lead, trumpSuit, levelRank)
}

/** 当前已出牌中的最大者；本墩尚未有人出牌时返回 null */
export function currentTrickLeader(
  trick: TrickState,
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayerPosition | null {
  return trick.plays.length > 0
    ? judgeTrick(trick, trumpSuit, levelRank)
    : null
}

/** 当前候选牌是否能大过本墩已出的最大牌；尚无可比较对象时返回 null */
export function canBeatCurrentPlay(
  state: PlayState,
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean | null {
  const { trick } = state
  if (trick.leadDoor === null || trick.plays.length === 0) return null

  const leader = currentTrickLeader(trick, trumpSuit, levelRank)
  const best = trick.plays.find(play => play.player === leader)
  if (!best) return null

  const lead: HandShape = {
    type: trick.leadType,
    door: trick.leadDoor,
    count: trick.leadCount,
    pairs: trick.leadPairs,
    tractor: trick.leadTractor,
  }
  return beats(cards, best.cards, lead, trumpSuit, levelRank)
}

// ------------------------------------------------------------
// 出牌 / 收墩
// ------------------------------------------------------------

/**
 * 领出解析：甩牌被三家管住时**自动出小**——改为出「最小的被拦组」
 * （单张 → 对子 → 拖拉机，见 `hand.ts::throwFallback`），其余牌留在手上。
 * 未被拦则按原牌出。
 */
function resolveLead(
  hands: Hands,
  player: PlayerPosition,
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): { cards: Card[]; throwBlocked: boolean; throwAttempt: Card[] } {
  const shape = analyzeShape(cards, trumpSuit, levelRank)
  if (shape.type !== HandType.Throw) {
    return { cards, throwBlocked: false, throwAttempt: [] }
  }
  const fb = throwFallback(cards, otherHands(hands, player), trumpSuit, levelRank)
  return fb
    ? { cards: fb.cards, throwBlocked: true, throwAttempt: cards }
    : { cards, throwBlocked: false, throwAttempt: [] }
}

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
  // 领出且是甩牌 → 被拦则自动出小（实际出的牌换成最小的被拦组）
  const resolved = isLeading(state)
    ? resolveLead(hands, player, cards, trumpSuit, levelRank)
    : null
  const played = resolved ? resolved.cards : cards

  const newHands: Hands = {
    ...hands,
    [player]: removeCards(hands[player], played),
  }

  const play: PlayedCards = {
    player,
    cards: played,
    handType: analyzeShape(played, trumpSuit, levelRank).type,
  }
  const trick: TrickState = { ...state.trick, plays: [...state.trick.plays, play] }

  // 首家出牌 → 记录首出信息
  if (trick.leadDoor === null) {
    const shape = analyzeShape(played, trumpSuit, levelRank)
    trick.leadDoor = shape.door
    trick.leadCount = played.length
    trick.leadType = shape.type
    trick.leadPairs = shape.pairs
    trick.leadTractor = shape.tractor
    // 甩牌合法性：在牌已经打出**之后**判定；被拦则已按「自动出小」改出
    trick.throwBlocked = resolved?.throwBlocked ?? false
    trick.throwAttempt = resolved?.throwAttempt ?? []
  }

  // 四家出完 → 等待收墩
  if (trick.plays.length === ALL_POSITIONS.length) {
    trick.complete = true
    trick.winner = judgeTrick(trick, trumpSuit, levelRank)
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

/** 收墩：结算赢家与分数，开始下一墩；若手牌已空则本局结束（并结算抠底） */
export function collectTrick(
  hands: Hands,
  state: PlayState,
  bottomCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): PlayResult {
  const winner = state.trick.winner ?? state.trick.leadPlayer
  const cards = state.trick.plays.flatMap(p => p.cards)
  const points = trickPoints(cards)

  const collected: Trick = {
    plays: state.trick.plays,
    leadPlayer: state.trick.leadPlayer,
    winner,
    points,
  }

  const roundOver = ALL_POSITIONS.every(p => hands[p].length === 0)
  const score = accumulate(
    {
      defendingPoints: state.defendingPoints,
      bankerPoints: state.bankerPoints,
    },
    winner,
    cards,
    state.banker,
  )

  // 最后一墩：结算抠底（闲家赢 → 底牌分 × 倍数 计入闲家得分）
  const bottom = roundOver
    ? settleBottom(collected, bottomCards, state.banker, trumpSuit, levelRank)
    : null
  const defendingPoints = score.defendingPoints + (bottom?.points ?? 0)

  return {
    hands,
    state: {
      banker: state.banker,
      turn: winner,
      trick: emptyTrick(winner),
      tricks: [...state.tricks, collected],
      defendingPoints,
      bankerPoints: score.bankerPoints,
      bottom,
    },
    roundOver,
  }
}
