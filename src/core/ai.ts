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
import { beats, judgePlays } from './trick.ts'
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

  // 手里有同门同点数的另一张 → 优先按对子整体出，不奖励拆单张
  const hasPairMate = hands[player].some(c =>
    c.id !== card.id && c.suit === card.suit && c.rank === card.rank)
  if (hasPairMate) return 0

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
/** AK 甩牌把某对手该门仅剩的 2 张全部抓获时，额外加成 */
const AK_CAPTURE_BONUS = 60
/** 安全 KK 对子（外面无 AA）的领出加成 */
const SAFE_PAIR_LEAD_BONUS = 60
/** 对手的 AA 是其该门唯一对子时，拆 KK 领单张 K 的加成 */
const SPLIT_KING_BONUS = 60
/** 分牌例外：0 分墩、只有分牌能压、且受益方无法加分时，压牌的惩罚 */
const PASS_POINT_CARD_PENALTY = 2 * TRICK_WIN_VALUE + 50
/** 跟单张时拆对子 / 拆拖拉机的结构惩罚 */
const BREAK_PAIR_PENALTY = 6
const BREAK_TRACTOR_PENALTY = 7

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
 * 注意：补牌本身不限牌型，但「想大出」必须用同型主牌：
 * 对子需主牌对子、拖拉机需同长主牌拖拉机（与 trick.ts::canCompete 一致）。
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
  if (card.rank !== Rank.King || card.rank === levelRank) return 0
  const door = doorOf(card, trumpSuit, levelRank)
  if (door === 'trump') return 0

  const hasPairMate = hands[player].some(c =>
    c.id !== card.id && c.suit === card.suit && c.rank === Rank.King)
  if (!hasPairMate) return 0

  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player))
  for (const pos of opponents) {
    const oppDoorCards = hands[pos].filter(
      c => doorOf(c, trumpSuit, levelRank) === door,
    )
    const pairs = leadPairUnits(oppDoorCards, trumpSuit, levelRank)
    const hasAces = pairs.some(unit => unit.cards[0].rank === Rank.Ace)
    if (hasAces && pairs.length === 1) return SPLIT_KING_BONUS
  }
  return 0
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
  const door = doorOf(card, trumpSuit, levelRank)
  const doorCards = hand.filter(
    c => doorOf(c, trumpSuit, levelRank) === door,
  )
  const units = leadPairUnits(doorCards, trumpSuit, levelRank)
  const unit = units.find(u => u.cards.some(c => c.id === card.id))
  if (!unit) return 0

  const slots = new Set(units.map(u => u.slot))
  const inTractor = slots.has(unit.slot - 1) || slots.has(unit.slot + 1)
  return inTractor ? BREAK_TRACTOR_PENALTY : BREAK_PAIR_PENALTY
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
  const hasDoor = hand.some(c => doorOf(c, trumpSuit, levelRank) === door)
  if (hasDoor) {
    return hand.some(c =>
      doorOf(c, trumpSuit, levelRank) === door && isPointCard(c.rank))
  }
  return hand.some(c => isPointCard(c.rank))
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
  const trick = state.trick
  if (trick.leadDoor === null || trick.leadDoor === 'trump') return 0
  if (trick.leadCount !== 1) return 0
  if (trick.plays.length < 1 || trick.plays.length > 2) return 0

  const leader = trick.leadPlayer
  const second = nextPlayer(leader)
  const third = nextPlayer(second)
  const fourth = nextPlayer(third)
  if (player !== second && player !== third) return 0

  const currentHighPlayer = player === third ? second : leader
  if (teamOf(currentHighPlayer) === teamOf(player)) return 0

  const lead: HandShape = {
    type: trick.leadType,
    door: trick.leadDoor,
    count: trick.leadCount,
    pairs: trick.leadPairs,
    tractor: trick.leadTractor,
  }
  if (judgePlays(trick.plays, lead, trumpSuit, levelRank) !== currentHighPlayer) {
    return 0
  }

  // 第 1、2 家出的都是无分牌
  if (trickPoints(trick.plays.flatMap(play => play.cards)) !== 0) return 0
  // 只保护 10 分牌（K / 10）；5 分牌价值较低，不触发此例外
  if (candidate.rank !== Rank.King && candidate.rank !== Rank.Ten) return 0

  const bestPlay = trick.plays.find(play => play.player === currentHighPlayer)
  if (!bestPlay) return 0

  // 手里所有能压过当前大牌的牌必须全都是分牌
  const beatingCards = hands[player].filter(card =>
    validateFollow(hands[player], lead, [card], trumpSuit, levelRank).ok
    && beats([card], bestPlay.cards, lead, trumpSuit, levelRank))
  if (beatingCards.length === 0) return 0
  if (beatingCards.some(card => !isPointCard(card.rank))) return 0

  // 必须存在一个比这张分牌更便宜的合法非分牌可以「放过」
  const candidateCost = cardCost(candidate, trumpSuit, levelRank)
  const canPass = hands[player].some(card =>
    !isPointCard(card.rank)
    && cardCost(card, trumpSuit, levelRank) < candidateCost
    && validateFollow(hands[player], lead, [card], trumpSuit, levelRank).ok)
  if (!canPass) return 0

  // 当前大牌那一方的搭档（本墩受益者）无法再往这墩加分
  const beneficiary = player === third ? fourth : third
  if (canAddPointsToTrick(
    hands[beneficiary], trick.leadDoor, trumpSuit, levelRank,
  )) {
    return 0
  }

  return -PASS_POINT_CARD_PENALTY
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
  if (lead.door === null || lead.door === 'trump') return null

  const opponents = ALL_POSITIONS.filter(pos => teamOf(pos) !== teamOf(player))
  if (opponents.some(pos =>
    canRuffWithTrump(hands[pos], lead, trumpSuit, levelRank))) {
    return null
  }

  const isAkThrow = lead.count === 2
    && cards.some(c => c.rank === Rank.Ace)
    && cards.some(c => c.rank === Rank.King)

  if (lead.type === HandType.Pair) {
    const slot = slotOf(cards[0], trumpSuit, levelRank)
    for (const pos of opponents) {
      const oppDoorCards = hands[pos].filter(
        c => doorOf(c, trumpSuit, levelRank) === lead.door,
      )
      const hasHigherPair = leadPairUnits(oppDoorCards, trumpSuit, levelRank)
        .some(unit => unit.slot > slot)
      if (hasHigherPair) return null
    }
  }
  else if (!isAkThrow) {
    return null
  }

  const captureBonus = isAkThrow && opponents.some(pos =>
    hands[pos].filter(c => doorOf(c, trumpSuit, levelRank) === lead.door).length === 2,
  )
    ? AK_CAPTURE_BONUS
    : 0

  const plays: PlayState['trick']['plays'] = [{
    player,
    cards,
    handType: lead.type,
  }]
  const simHands: Hands = {
    ...hands,
    [player]: hands[player].filter(c => !cards.some(p => p.id === c.id)),
  }
  let turn = nextPlayer(player)
  for (let i = 0; i < 3; i++) {
    const follow = chooseFollow(simHands[turn], lead, trumpSuit, levelRank)
    if (follow.length !== lead.count) return null
    plays.push({
      player: turn,
      cards: follow,
      handType: analyzeShape(follow, trumpSuit, levelRank).type,
    })
    simHands[turn] = simHands[turn].filter(
      c => !follow.some(p => p.id === c.id),
    )
    turn = nextPlayer(turn)
  }

  const winner = judgePlays(plays, lead, trumpSuit, levelRank)
  if (teamOf(winner) !== teamOf(player)) return null

  const points = trickPoints(plays.flatMap(play => play.cards))
  const cardEconomy = plays.reduce((value, play) => {
    const cost = play.cards.reduce(
      (sum, card) => sum + cardCost(card, trumpSuit, levelRank),
      0,
    )
    return value + (teamOf(play.player) === teamOf(player) ? -cost : cost)
  }, 0)
  const isKingPair = lead.type === HandType.Pair
    && cards.length === 2
    && cards.every(c => c.rank === Rank.King)
  const pairBonus = isKingPair ? SAFE_PAIR_LEAD_BONUS : 0
  return TRICK_WIN_VALUE + points + cardEconomy + captureBonus + pairBonus
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
  strategicBonus: number,
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
  let score = base + strategicBonus
  if (won) score += leadBonus
  else if (ruffBait) score += ruffBaitBonus(plays, winner, lead, trumpSuit, levelRank)
  return score
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
  strategicBonus: number,
  alpha: number,
  beta: number,
): number {
  if (plays.length === 4) {
    return utility(
      plays, lead, rootTeam, trumpSuit, levelRank, leadBonus, ruffBait, strategicBonus,
    )
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
      strategicBonus,
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
      const splitBonus = splitKingLeadBonus(card, hands, player, trumpSuit, levelRank)
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
        splitBonus,
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
      const akThrows: Card[][] = []
      const aces = doorCards.filter(card => card.rank === Rank.Ace)
      const kings = doorCards.filter(card => card.rank === Rank.King)
      for (const ace of aces) {
        for (const king of kings) {
          akThrows.push([ace, king])
        }
      }
      const candidates: Card[][] = [
        ...leadPairUnits(doorCards, trumpSuit, levelRank)
          .map(unit => unit.cards),
        ...generateTractorLeadCandidates(doorCards, trumpSuit, levelRank),
        ...generateThrowLeadCandidates(doorCards, trumpSuit, levelRank),
        ...akThrows,
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
        ) ?? scoreWinningMultiLead(
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
      const strategicBonus = pointCardPassPenalty(
        state, hands, player, trumpSuit, levelRank, card,
      ) - breakStructurePenalty(card, hands[player], trumpSuit, levelRank)
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
