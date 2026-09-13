// ============================================================
// 升级（拖拉机 / 80分）— 全局类型定义
// ============================================================

// ---- 花色 ----
export enum Suit {
  Spade = 'S',   // ♠ 黑桃
  Heart = 'H',   // ♥ 红心
  Club = 'C',    // ♣ 梅花
  Diamond = 'D', // ♦ 方块
  Joker = 'J',   // 🃏 王
}

export const SUIT_ORDER: Record<Suit, number> = {
  [Suit.Spade]: 0,
  [Suit.Heart]: 1,
  [Suit.Club]: 2,
  [Suit.Diamond]: 3,
  [Suit.Joker]: 4,
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  [Suit.Spade]: '♠',
  [Suit.Heart]: '♥',
  [Suit.Club]: '♣',
  [Suit.Diamond]: '♦',
  [Suit.Joker]: '🃏',
}

export const SUIT_NAME_ZH: Record<Suit, string> = {
  [Suit.Spade]: '黑桃',
  [Suit.Heart]: '红心',
  [Suit.Club]: '梅花',
  [Suit.Diamond]: '方块',
  [Suit.Joker]: '王',
}

// ---- 牌面值 ----
export enum Rank {
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Ten = 10,
  Jack = 11,
  Queen = 12,
  King = 13,
  Ace = 14,
  SmallJoker = 16,
  BigJoker = 17,
}

export const RANK_NAME: Record<Rank, string> = {
  [Rank.Two]: '2',
  [Rank.Three]: '3',
  [Rank.Four]: '4',
  [Rank.Five]: '5',
  [Rank.Six]: '6',
  [Rank.Seven]: '7',
  [Rank.Eight]: '8',
  [Rank.Nine]: '9',
  [Rank.Ten]: '10',
  [Rank.Jack]: 'J',
  [Rank.Queen]: 'Q',
  [Rank.King]: 'K',
  [Rank.Ace]: 'A',
  [Rank.SmallJoker]: '小王',
  [Rank.BigJoker]: '大王',
}

/** 牌面值是否为分牌（5/10/K） */
export function isPointCard(rank: Rank): boolean {
  return rank === Rank.Five || rank === Rank.Ten || rank === Rank.King
}

/** 分牌对应的分值 */
export function pointValue(rank: Rank): number {
  if (rank === Rank.Five) return 5
  if (rank === Rank.Ten || rank === Rank.King) return 10
  return 0
}

// ---- 卡牌标识 ----
/** 每张牌的唯一 ID（两副牌有重复花色+点数，故需要 ID 区分） */
export type CardId = string

// ---- 玩家方位 ----
export enum PlayerPosition {
  East = 'E',
  South = 'S',
  West = 'W',
  North = 'N',
}

export const POSITION_NAME_ZH: Record<PlayerPosition, string> = {
  [PlayerPosition.East]: '东',
  [PlayerPosition.South]: '南',
  [PlayerPosition.West]: '西',
  [PlayerPosition.North]: '北',
}

export const ALL_POSITIONS: readonly PlayerPosition[] = [
  PlayerPosition.East,
  PlayerPosition.South,
  PlayerPosition.West,
  PlayerPosition.North,
]

/** 返回对家方位 */
export function partnerOf(pos: PlayerPosition): PlayerPosition {
  switch (pos) {
    case PlayerPosition.East:
      return PlayerPosition.West
    case PlayerPosition.South:
      return PlayerPosition.North
    case PlayerPosition.West:
      return PlayerPosition.East
    case PlayerPosition.North:
      return PlayerPosition.South
  }
}

/** 返回下一个出牌方位（顺时针） */
export function nextPlayer(pos: PlayerPosition): PlayerPosition {
  switch (pos) {
    case PlayerPosition.East:
      return PlayerPosition.South
    case PlayerPosition.South:
      return PlayerPosition.West
    case PlayerPosition.West:
      return PlayerPosition.North
    case PlayerPosition.North:
      return PlayerPosition.East
  }
}

/** 从方位获取队伍 */
export function teamOf(pos: PlayerPosition): Team {
  return (pos === PlayerPosition.South || pos === PlayerPosition.North)
    ? Team.NS
    : Team.EW
}

// ---- 队伍 ----
export enum Team {
  NS = 'NS', // 南北
  EW = 'EW', // 东西
}

export const TEAM_NAME_ZH: Record<Team, string> = {
  [Team.NS]: '南北',
  [Team.EW]: '东西',
}

/** 返回对方队伍 */
export function oppositeTeam(t: Team): Team {
  return t === Team.NS ? Team.EW : Team.NS
}

// ---- 玩家操控模式 ----
export enum PlayerMode {
  /** 手动 — 等待玩家操作 */
  Manual = 'manual',
  /** 托管 — AI 自动操作 */
  Auto = 'auto',
}

// ---- 牌型（用于出牌检测） ----
export enum HandType {
  /** 单张 */
  Single = 'single',
  /** 对子 */
  Pair = 'pair',
  /** 拖拉机（至少 2 个连续对子） */
  Tractor = 'tractor',
  /** 甩牌（多张组合，需校验无人能管） */
  Throw = 'throw',
}

// ---- 卡牌接口 ----
export interface Card {
  /** 唯一标识，如 "S-2-0" */
  id: CardId
  /** 花色 */
  suit: Suit
  /** 牌面值 */
  rank: Rank
}

// ---- 出牌记录 ----
export interface PlayedCards {
  player: PlayerPosition
  cards: Card[]
  handType: HandType
}

// ---- 墩（一回合出牌） ----
export interface Trick {
  /** 本墩出牌记录（按出牌顺序） */
  plays: PlayedCards[]
  /** 首出方位 */
  leadPlayer: PlayerPosition
  /** 谁赢了这墩 */
  winner: PlayerPosition | null
  /** 本墩总分数 */
  points: number
}

// ---- 叫主 ----
export interface BidRecord {
  player: PlayerPosition
  /** 叫的花色（null 表示"无主"） */
  suit: Suit | null
  /** 是否反主 */
  isReverse: boolean
}

// ---- 计分 ----
export interface RoundScore {
  /** 这轮防守方得分 */
  defendingPoints: number
  /** 底牌分（含抠底倍数） */
  bottomPoints: number
  /** 抠底倍数 */
  bottomMultiplier: number
  /** 是否抠底 */
  isBottomTaken: boolean
  /** 庄家是否升级 */
  bankerUpgrade: number // 0=不升级换庄, 1=升1级, 2=升2级, 3=升3级
}

// ---- 牌局回放 ----
export interface ReplayData {
  version: number
  timestamp: number
  seed?: number
  players: PlayerPosition[]
  levelStart: Rank
  levelEnd: Rank
  rounds: RoundRecord[]
}

export interface RoundRecord {
  /** 当前级牌 */
  level: Rank
  /** 庄家 */
  banker: PlayerPosition
  /** 主花色 */
  trumpSuit: Suit | null
  /** 叫主记录 */
  bids: BidRecord[]
  /** 每个玩家的手牌（用于回放展示） */
  hands: Record<PlayerPosition, Card[]>
  /** 底牌 */
  bottomCards: Card[]
  /** 扣底后底牌（庄家埋的） */
  buriedCards: Card[]
  /** 所有墩 */
  tricks: Trick[]
  /** 得分 */
  score: RoundScore
}

// ---- 游戏阶段 ----
export enum GamePhase {
  /** 等待开始 */
  Waiting = 'waiting',
  /** 发牌 */
  Dealing = 'dealing',
  /** 叫主 */
  BiddingTrump = 'bidding_trump',
  /** 扣底 */
  Burying = 'burying',
  /** 出牌 */
  Playing = 'playing',
  /** 一局结束 */
  RoundEnd = 'round_end',
  /** 游戏结束（打到 A 并胜利） */
  GameEnd = 'game_end',
}

// ---- 可视性设置（东/西/北家牌面是否显示） ----
export type VisibilitySettings = Record<PlayerPosition, boolean>

// ---- 玩家模式设置 ----
export type PlayerModeSettings = Record<PlayerPosition, PlayerMode>

// ---- 游戏全局配置 ----
export interface GameConfig {
  /** 初始等级 */
  startLevel: Rank
  /** 目标等级（打到这个即胜利） */
  targetLevel: Rank
  /** 每局底牌数 */
  bottomCount: number
  /** 是否允许甩牌 */
  allowThrow: boolean
  /** 抠底倍数：单张 */
  bottomMultiplierSingle: number
  /** 抠底倍数：对子 */
  bottomMultiplierPair: number
  /** 抠底倍数：拖拉机（基础） */
  bottomMultiplierTractor: number
  /** 每多一个对子追加倍数 */
  bottomMultiplierPerPair: number
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  startLevel: Rank.Two,
  targetLevel: Rank.Ace,
  bottomCount: 8,
  allowThrow: true,
  bottomMultiplierSingle: 2,
  bottomMultiplierPair: 4,
  bottomMultiplierTractor: 8,
  bottomMultiplierPerPair: 2,
}

