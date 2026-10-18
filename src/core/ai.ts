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
  throwFallback,
  validateFollow,
} from './hand.ts'
import { judgePlays } from './trick.ts'
import { trickPoints } from './scoring.ts'
import type { Hands, PlayState } from './play.ts'

const TRICK_WIN_VALUE = 1000

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
const SAFE_POINT_LEAD_BONUS = 60

function safePointLeadBonus(
  card: Card,
  hands: Hands,
  player: PlayerPosition,
  trumpSuit: Suit | null,
  levelRank: Rank,
): number {
  // 只处理 10 分牌；该牌为级牌时是主牌，本技巧不适用
  if (card.rank !== Rank.King && card.rank !== Rank.Ten) return 0
  if (card.rank === levelRank) return 0

  const door = doorOf(card, trumpSuit, levelRank)
  if (door === 'trump') return 0

  const slot = slotOf(card, trumpSuit, levelRank)
  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player))
  for (const pos of opponents) {
    const hand = hands[pos]
    // 对手手里有更大的同门牌 → 这张 10 分牌不是最高牌
    if (hand.some(c =>
      doorOf(c, trumpSuit, levelRank) === door
      && slotOf(c, trumpSuit, levelRank) > slot
    )) {
      return 0
    }
    // 对手该门缺门且手里还有主牌 → 可能直接毙掉
    const hasDoor = hand.some(c => doorOf(c, trumpSuit, levelRank) === door)
    const canRuff = hand.some(c => doorOf(c, trumpSuit, levelRank) === 'trump')
    if (!hasDoor && canRuff) {
      return 0
    }
  }

  return SAFE_POINT_LEAD_BONUS
}

/**
 * 钓主（ruff bait）评价：
 * 主动领出对手可毙的副牌组合，用少量送分换取对手主牌的消耗。
 * 每钓出 1 张主牌按 1 墩估值；但组合本身每张主牌最多允许送 5 分，
 * 超过则不值得（如一对 5 = 10 分 / 2 张主牌，值得；K1010 = 30 分 / 3 张，不值得）。
 */
const TRUMP_DRAW_VALUE = TRICK_WIN_VALUE
const RUFF_BAIT_POINT_PER_TRUMP = 5
const RUFF_BAIT_MAX_BONUS = 2 * TRICK_WIN_VALUE
const RUFF_BAIT_OVER_POINT_PENALTY = 2
const MAX_THROW_LEAD_CARDS = 5
const MAX_THROW_LEAD_CANDIDATES = 20

function cardCost(card: Card, trumpSuit: Suit | null, levelRank: Rank): number {
  const slot = slotOf(card, trumpSuit, levelRank)
  return doorOf(card, trumpSuit, levelRank) === 'trump' ? 20 + slot : slot
}

interface LeadPairUnit {
  slot: number
  cards: Card[]
}

/** 把一门手牌拆成对子单元（用于生成领出候选 / 判断能否毙牌） */
function leadPairUnits(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): LeadPairUnit[] {
  const byKey = new Map<string, Card[]>()
  for (const card of cards) {
    const key = `${card.suit}|${card.rank}`
    const arr = byKey.get(key) ?? []
    arr.push(card)
    byKey.set(key, arr)
  }
  const units: LeadPairUnit[] = []
  for (const arr of byKey.values()) {
    if (arr.length >= 2) {
      units.push({ slot: slotOf(arr[0], trumpSuit, levelRank), cards: arr.slice(0, 2) })
    }
  }
  return units
}

/** 是否存在指定长度的连续对子段（拖拉机） */
function hasConsecutivePairRun(units: LeadPairUnit[], length: number): boolean {
  if (length < 2 || units.length < length) return false
  const sorted = [...units].sort((a, b) => a.slot - b.slot)
  for (let i = 0; i + length <= sorted.length; i++) {
    let ok = true
    for (let j = 1; j < length; j++) {
      if (sorted[i + j].slot !== sorted[i + j - 1].slot + 1) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * 判断某家能否用主牌毙掉这手副牌领出（只判断合法性与形态，不比较大小）。
 * 与 validateFollow 的「全主牌补牌」约束保持一致。
 */
function canRuffWithTrump(
  hand: Card[],
  lead: HandShape,
  trumpSuit: Suit | null,
  levelRank: Rank,
): boolean {
  if (lead.door === null || lead.door === 'trump') return false
  if (hand.some(c => doorOf(c, trumpSuit, levelRank) === lead.door)) return false

  const trumps = hand.filter(c => doorOf(c, trumpSuit, levelRank) === 'trump')
  if (trumps.length < lead.count) return false

  if (lead.tractor >= 2) {
    return hasConsecutivePairRun(
      leadPairUnits(trumps, trumpSuit, levelRank),
      lead.tractor,
    )
  }
  if (lead.pairs > 0) {
    const needPairs = Math.min(lead.pairs, Math.floor(lead.count / 2))
    return leadPairUnits(trumps, trumpSuit, levelRank).length >= needPairs
  }
  return true
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
    )
  return trumps
    .slice(0, lead.count)
    .reduce((sum, c) => sum + cardCost(c, trumpSuit, levelRank), 0)
}

/** 从 leader 开始的四家出牌顺序 */
function turnOrderFrom(player: PlayerPosition): PlayerPosition[] {
  const order: PlayerPosition[] = [player]
  let current = player
  for (let i = 0; i < 3; i++) {
    current = nextPlayer(current)
    order.push(current)
  }
  return order
}

/** 生成同门内的所有拖拉机领出候选（长度 ≥ 2 对，含子段） */
function generateTractorLeadCandidates(
  doorCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[][] {
  const units = leadPairUnits(doorCards, trumpSuit, levelRank)
    .sort((a, b) => a.slot - b.slot)
  const runs: LeadPairUnit[][] = []
  let current: LeadPairUnit[] = []
  for (const unit of units) {
    if (current.length === 0
      || unit.slot === current[current.length - 1].slot + 1) {
      current.push(unit)
    }
    else {
      if (current.length >= 2) runs.push(current)
      current = [unit]
    }
  }
  if (current.length >= 2) runs.push(current)

  const candidates: Card[][] = []
  for (const run of runs) {
    for (let length = 2; length <= run.length; length++) {
      for (let start = 0; start + length <= run.length; start++) {
        candidates.push(
          run.slice(start, start + length).flatMap(unit => unit.cards),
        )
      }
    }
  }
  return candidates
}

/** 生成同门内的甩牌候选（最多 5 张，保留点数最低的若干组） */
function generateThrowLeadCandidates(
  doorCards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): Card[][] {
  const candidates: Card[][] = []
  const maxSize = Math.min(MAX_THROW_LEAD_CARDS, doorCards.length)
  for (let size = 3; size <= maxSize; size++) {
    const combo: Card[] = []
    const walk = (start: number) => {
      if (combo.length === size) {
        const shape = analyzeShape(combo, trumpSuit, levelRank)
        if (shape.type === HandType.Throw && shape.door !== null) {
          candidates.push([...combo])
        }
        return
      }
      for (let i = start; i < doorCards.length; i++) {
        combo.push(doorCards[i])
        walk(i + 1)
        combo.pop()
      }
    }
    walk(0)
  }
  candidates.sort((a, b) => trickPoints(a) - trickPoints(b))
  return candidates.slice(0, MAX_THROW_LEAD_CANDIDATES)
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
  if (lead.door === null || lead.door === 'trump') return null

  const order = turnOrderFrom(player)
  const partner = order.find(
    pos => pos !== player && teamOf(pos) === teamOf(player),
  )
  if (!partner) return null
  const partnerIndex = order.indexOf(partner)

  let ruffingOpponent: PlayerPosition | null = null
  for (let i = 1; i < order.length; i++) {
    const pos = order[i]
    if (teamOf(pos) === teamOf(player)) continue
    if (!canRuffWithTrump(hands[pos], lead, trumpSuit, levelRank)) continue

    // 对家在这家之后、也能用主牌毙 → 结果不确定，不按「必被毙」估值
    if (i < partnerIndex
      && canRuffWithTrump(hands[partner], lead, trumpSuit, levelRank)) {
      return null
    }
    ruffingOpponent = pos
    break
  }
  if (!ruffingOpponent) return null

  const leadPoints = trickPoints(cards)
  const trumpsSpent = cards.length
  const ownCost = cards.reduce(
    (sum, card) => sum + cardCost(card, trumpSuit, levelRank),
    0,
  )
  const opponentCost = cheapestRuffCost(
    hands[ruffingOpponent], lead, trumpSuit, levelRank,
  )
  let score = -TRICK_WIN_VALUE - leadPoints - ownCost + opponentCost
  const limit = trumpsSpent * RUFF_BAIT_POINT_PER_TRUMP
  if (leadPoints <= limit) {
    score += Math.min(trumpsSpent * TRUMP_DRAW_VALUE, RUFF_BAIT_MAX_BONUS)
  }
  else {
    // 送分过高：不仅不给钓主加成，还要额外降权（K1010 这类组合）
    score -= (leadPoints - limit) * RUFF_BAIT_OVER_POINT_PENALTY
  }
  return score
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
  if (lead.door === null || lead.door === 'trump') return 0

  const winnerPlay = plays.find(play => play.player === winner)
  if (!winnerPlay) return 0
  if (!winnerPlay.cards.every(c => doorOf(c, trumpSuit, levelRank) === 'trump')) {
    return 0
  }

  const leadCards = plays[0].cards
  const leadPoints = trickPoints(leadCards)
  const trumpsSpent = leadCards.length
  const limit = trumpsSpent * RUFF_BAIT_POINT_PER_TRUMP
  if (leadPoints <= limit) {
    return Math.min(trumpsSpent * TRUMP_DRAW_VALUE, RUFF_BAIT_MAX_BONUS)
  }
  return -(leadPoints - limit) * RUFF_BAIT_OVER_POINT_PENALTY
}

function utility(
  plays: PlayState['trick']['plays'],
  lead: HandShape,
  rootTeam: ReturnType<typeof teamOf>,
  trumpSuit: Suit | null,
  levelRank: Rank,
  leadBonus: number,
  ruffBait: boolean,
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
  if (won) return base + leadBonus
  return base + (ruffBait
    ? ruffBaitBonus(plays, winner, lead, trumpSuit, levelRank)
    : 0)
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
  ruffBait: boolean,
  alpha: number,
  beta: number,
): number {
  if (plays.length === 4) {
    return utility(plays, lead, rootTeam, trumpSuit, levelRank, leadBonus, ruffBait)
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
      ruffBait,
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
 * 选择着法。
 *
 * 单张墩使用完美信息搜索；多张领出会额外评估「钓主」候选
 * （对手可毙的对子 / 拖拉机 / 甩牌）。多张跟牌仍使用基础合法策略。
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
    let bestCards: Card[] | null = null
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
      const leadBonus = safePointLeadBonus(card, hands, player, trumpSuit, levelRank)
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
        bestScore,
        Infinity,
      )
      if (score > bestScore) {
        bestScore = score
        bestCards = [card]
      }
    }

    // 多张钓主候选：对子 / 拖拉机 / 甩牌。
    // 只有在对手能用主牌毙掉、且对家不能反毙时才进入评分。
    const otherHands = ALL_POSITIONS
      .filter(pos => pos !== player)
      .map(pos => hands[pos])
    const sideDoors = new Set<Suit>()
    for (const card of hand) {
      const door = doorOf(card, trumpSuit, levelRank)
      if (door !== 'trump') sideDoors.add(door)
    }

    const seen = new Set<string>()
    for (const door of sideDoors) {
      const doorCards = hand.filter(
        card => doorOf(card, trumpSuit, levelRank) === door,
      )
      const candidates: Card[][] = [
        ...leadPairUnits(doorCards, trumpSuit, levelRank)
          .map(unit => unit.cards),
        ...generateTractorLeadCandidates(doorCards, trumpSuit, levelRank),
        ...generateThrowLeadCandidates(doorCards, trumpSuit, levelRank),
      ]

      for (const cards of candidates) {
        const key = cards.map(card => card.id).sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const lead = analyzeShape(cards, trumpSuit, levelRank)
        if (lead.door === null) continue
        // 甩牌会被三家拦住时自动出小，不作为钓主候选
        if (lead.type === HandType.Throw
          && throwFallback(cards, otherHands, trumpSuit, levelRank) !== null) {
          continue
        }

        const score = scoreRuffBaitLead(
          cards, lead, hands, player, trumpSuit, levelRank,
        )
        if (score === null) continue
        if (score > bestScore) {
          bestScore = score
          bestCards = cards
        }
      }
    }

    return bestCards ?? chooseLead(hand, trumpSuit, levelRank)
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
        false,
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
