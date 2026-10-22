// ============================================================
// 本局出牌记录（Play Log）
//
//   一局一份，下一局发牌时自动重建（上一局的记录随之清空）。
//   结构见 PLAY_LOG_SCHEMA.md：
//     PlayLog → rounds[] → RoundRecord → tricks[] → plays[]
//   没有事件层 / 时间戳 / 序号；顺序只由数组表达。
// ============================================================

import {
  type Card,
  type PlayerMode,
  type PlayerPosition,
  type Rank,
  type RuleOptions,
  type Suit,
  type Team,
  ALL_POSITIONS,
  HandType,
  Rank as R,
  Suit as S,
  teamOf,
} from './types.ts'
import { type Door, analyzeShape } from './hand.ts'
import { trickPoints } from './scoring.ts'

/** JSON 中的稳定卡牌 ID，如 "S5#0"、"J17#1" */
export type JsonCardId = string

/** shape 只记录非默认字段：单张就是 { type: "single" } */
export interface ShapeRecord {
  type: HandType
  /** 省略 = 混门 / 垫牌 */
  door?: Door
  /** 只在无法由 type 推出且 > 0 时出现（含对子的甩牌） */
  pairs?: number
  /** 省略 = 0 */
  points?: number
}

/** 甩牌被拦：记录原本想甩的牌（不记录谁拦的） */
export interface ThrowRecord {
  blocked: boolean
  attempted: JsonCardId[]
}

export interface PlayRecord {
  player: PlayerPosition
  /** 实际打出的牌 */
  cards: JsonCardId[]
  shape: ShapeRecord
  throw?: ThrowRecord
}

export interface ScoreAfter {
  defending: number
  banker: number
}

export interface TrickRecord {
  /** 显式领出者（读取方不应靠 plays[0] 推断） */
  leadPlayer: PlayerPosition
  /** 以下四项在收墩后写入；进行中的最后一墩没有 */
  winner?: PlayerPosition
  winnerTeam?: Team
  points?: number
  scoreAfter?: ScoreAfter
  plays: PlayRecord[]
}

export interface DealRecord {
  mode: 'shuffle' | 'sameDeal'
  seed?: number
  hands: Record<PlayerPosition, JsonCardId[]>
  bottom: JsonCardId[]
}

export interface TrumpRecord {
  suit: Suit | null
  declaredBy: PlayerPosition
  /** 报品；翻底定主为 null */
  strength: 1 | 2 | 3 | 4 | null
  cards: JsonCardId[]
  decidedBy: 'bid' | 'bottomFlip'
  /** 亮主时已发出的总张数（0..100） */
  atDealt: number
}

export interface BuriedRecord {
  player: PlayerPosition
  cards: JsonCardId[]
  points: number
}

export interface BottomRecord {
  taken: boolean
  winner: PlayerPosition | null
  tractorLength: number
  multiplier: number
  cardPoints: number
  points: number
}

export interface LevelChangeRecord {
  upgradingTeam: Team
  side: 'banker' | 'defender'
  steps: number
  switchBanker: boolean
}

export interface RoundResult {
  defendingPoints: number
  bankerPoints: number
  levelChange: LevelChangeRecord
  fromLevel: Rank
  toLevel: Rank
  lapsGained: number
  nextBanker: PlayerPosition
}

export interface RoundRecord {
  level: Rank
  playerModes: Record<PlayerPosition, PlayerMode>
  deal: DealRecord
  trump?: TrumpRecord
  buried?: BuriedRecord
  tricks: TrickRecord[]
  bottom?: BottomRecord
  result?: RoundResult
}

export interface PlayLog {
  schemaVersion: 1
  gameId: string
  appVersion?: string
  rules: RuleOptions
  startLevel: Rank
  rounds: RoundRecord[]
}

// ------------------------------------------------------------
// 卡牌 ID
// ------------------------------------------------------------

const CARD_ID_RE = /^([SHCDJ])(\d+)#([01])$/

/**
 * 建立「运行时 card.id → 稳定 ID」的映射。
 * 稳定 ID = `<suit><rank>#<copy>`，copy 为同 (suit, rank) 在当前 108 张里的出现次序。
 */
export function buildCardIdMap(
  hands: Record<PlayerPosition, Card[]>,
  bottom: Card[],
): Map<string, string> {
  const map = new Map<string, string>()
  const used = new Map<string, number>()
  const all = [...ALL_POSITIONS.flatMap(pos => hands[pos]), ...bottom]
  for (const card of all) {
    if (map.has(card.id)) continue
    const face = `${card.suit}${card.rank}`
    const copy = used.get(face) ?? 0
    used.set(face, copy + 1)
    map.set(card.id, `${face}#${copy}`)
  }
  return map
}

export function encodeCardId(map: Map<string, string>, card: Card): string {
  return map.get(card.id) ?? `${card.suit}${card.rank}#0`
}

export function encodeCards(map: Map<string, string>, cards: Card[]): string[] {
  return cards.map(card => encodeCardId(map, card))
}

/** 稳定 ID → 展示用 Card（只用于渲染，不参与规则） */
export function decodeCardId(id: string): Card {
  const match = CARD_ID_RE.exec(id)
  if (!match) {
    return { id, suit: S.Spade, rank: R.Two }
  }
  return {
    id,
    suit: match[1] as Suit,
    rank: Number(match[2]) as Rank,
  }
}

// ------------------------------------------------------------
// 记录构造
// ------------------------------------------------------------

export function makeShape(
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
): ShapeRecord {
  const shape = analyzeShape(cards, trumpSuit, levelRank)
  const record: ShapeRecord = { type: shape.type }
  if (shape.door !== null) record.door = shape.door
  if (shape.type === HandType.Throw && shape.pairs > 0) {
    record.pairs = shape.pairs
  }
  const points = trickPoints(cards)
  if (points > 0) record.points = points
  return record
}

export function createRoundRecord(params: {
  level: Rank
  playerModes: Record<PlayerPosition, PlayerMode>
  deal: DealRecord
}): RoundRecord {
  return {
    level: params.level,
    playerModes: { ...params.playerModes },
    deal: params.deal,
    // 预先占位，保证 JSON 字段顺序与文档一致（undefined 不会被序列化）
    trump: undefined,
    buried: undefined,
    tricks: [],
    bottom: undefined,
    result: undefined,
  }
}

/**
 * 追加一手实际生效的出牌。
 * @param isLead 这一手是否为本墩领出（决定是否新建 TrickRecord）
 * @param throwAttempt 甩牌被拦时原想甩的牌（非领出 / 未被拦时传空数组）
 */
export function appendPlay(
  record: RoundRecord,
  player: PlayerPosition,
  cards: Card[],
  trumpSuit: Suit | null,
  levelRank: Rank,
  isLead: boolean,
  throwAttempt: Card[],
  cardIdMap: Map<string, string>,
): void {
  if (isLead || record.tricks.length === 0) {
    record.tricks.push({ leadPlayer: player, plays: [] })
  }
  const trick = record.tricks[record.tricks.length - 1]
  if (!trick) return

  const play: PlayRecord = {
    player,
    cards: encodeCards(cardIdMap, cards),
    shape: makeShape(cards, trumpSuit, levelRank),
  }
  if (isLead && throwAttempt.length > 0) {
    play.throw = {
      blocked: true,
      attempted: encodeCards(cardIdMap, throwAttempt),
    }
  }
  trick.plays.push(play)
}

/** 收墩：补齐本墩结果（日志里最后一墩一定就是刚收的这墩） */
export function closeLastTrick(
  record: RoundRecord,
  winner: PlayerPosition,
  points: number,
  defendingPoints: number,
  bankerPoints: number,
): void {
  const trick = record.tricks[record.tricks.length - 1]
  if (!trick || trick.plays.length !== 4) return
  trick.winner = winner
  trick.winnerTeam = teamOf(winner)
  trick.points = points
  trick.scoreAfter = { defending: defendingPoints, banker: bankerPoints }
}

/**
 * 撤销：把记录截断回快照点（无痕）。
 * @param trickCount 快照时的 tricks 长度
 * @param lastPlayCount 快照时最后一墩的出牌数
 * @param clearBuried 快照发生在埋底之前时为 true
 */
export function truncateRecord(
  record: RoundRecord,
  trickCount: number,
  lastPlayCount: number,
  clearBuried: boolean,
): void {
  record.tricks.length = Math.max(0, Math.min(record.tricks.length, trickCount))
  const last = record.tricks[record.tricks.length - 1]
  if (last && last.plays.length > lastPlayCount) {
    last.plays.length = lastPlayCount
  }
  // 被缩短的最后一墩重新变成「进行中」：清掉已收墩的结果
  if (last && last.plays.length < 4) {
    delete last.winner
    delete last.winnerTeam
    delete last.points
    delete last.scoreAfter
  }
  delete record.bottom
  delete record.result
  if (clearBuried) delete record.buried
}

// ------------------------------------------------------------
// 导出
// ------------------------------------------------------------

export function buildPlayLog(params: {
  gameId: string
  rules: RuleOptions
  startLevel: Rank
  record: RoundRecord | null
  appVersion?: string
}): PlayLog {
  return {
    schemaVersion: 1,
    gameId: params.gameId,
    appVersion: params.appVersion,
    rules: { ...params.rules },
    startLevel: params.startLevel,
    rounds: params.record ? [params.record] : [],
  }
}

/**
 * JSONC 序列化：在严格 JSON 的基础上给所有非空对象 / 数组补尾逗号。
 * （不输出注释；注释只在手写文件里出现）
 */
export function toJsonc(value: unknown): string {
  const lines = JSON.stringify(value, null, 2).split('\n')
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if ((trimmed === '}' || trimmed === ']') && out.length > 0) {
      const prev = out[out.length - 1]
      const prevTrimmed = prev.trim()
      if (
        !prevTrimmed.endsWith(',')
        && !prevTrimmed.endsWith('{')
        && !prevTrimmed.endsWith('[')
      ) {
        out[out.length - 1] = `${prev},`
      }
    }
    out.push(line)
  }
  return `${out.join('\n')}\n`
}

/** 默认严格 JSON；`jsonc` = 带尾逗号 */
export function serializePlayLog(log: PlayLog, format: 'json' | 'jsonc'): string {
  return format === 'jsonc'
    ? toJsonc(log)
    : `${JSON.stringify(log, null, 2)}\n`
}

