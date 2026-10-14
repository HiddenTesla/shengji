// ============================================================
// 等级 & 升级规则
// ============================================================

import {
  type PlayerPosition,
  Rank,
  RANK_NAME,
  Team,
  nextPlayer,
  oppositeTeam,
  teamOf,
} from './types.ts'

/** 可打的等级列表（从小到大） */
export const LEVEL_RANKS: readonly Rank[] = [
  Rank.Two,
  Rank.Three,
  Rank.Four,
  Rank.Five,
  Rank.Six,
  Rank.Seven,
  Rank.Eight,
  Rank.Nine,
  Rank.Ten,
  Rank.Jack,
  Rank.Queen,
  Rank.King,
  Rank.Ace,
]

/** 等级在 LEVEL_RANKS 中的索引 */
const LEVEL_INDEX_MAP: Map<Rank, number> = new Map(
  LEVEL_RANKS.map((r, i) => [r, i]),
)

/**
 * 等级管理器
 * 管理当前打几（2→A），提供升级判定
 */
export class RankManager {
  /** 当前等级索引（0=打2，12=打A） */
  private _index: number

  constructor(startLevel: Rank = Rank.Two) {
    const idx = LEVEL_INDEX_MAP.get(startLevel)
    if (idx === undefined) {
      throw new Error(`无效起始等级: ${RANK_NAME[startLevel]}`)
    }
    this._index = idx
  }

  /** 当前等级（如 Rank.Five = 打 5） */
  get currentLevel(): Rank {
    return LEVEL_RANKS[this._index]
  }

  /** 当前等级名称（如 "5"） */
  get currentLevelName(): string {
    return RANK_NAME[this.currentLevel]
  }

  /** 当前等级在排行榜中的索引（0-based） */
  get index(): number {
    return this._index
  }

  /** 是否已达到最高等级（A） */
  get isMaxLevel(): boolean {
    return this._index >= LEVEL_RANKS.length - 1
  }

  /** 是否已通关（打到 A 并胜利） */
  get isGameWon(): boolean {
    return this._index >= LEVEL_RANKS.length
  }

  /**
   * 升级
   * @param steps 升几级（正数）
   * @returns 实际升级的级数（可能因到达 A 后不足）
   */
  upgrade(steps: number): number {
    const oldIndex = this._index
    this._index = Math.min(this._index + steps, LEVEL_RANKS.length)
    const actual = this._index - oldIndex

    // 如果正好升到 A 之后，标记为通关
    if (this._index === LEVEL_RANKS.length && oldIndex < LEVEL_RANKS.length) {
      // 已经到达通关状态
    }

    return actual
  }

  /** 重置到指定等级 */
  reset(level: Rank = Rank.Two): void {
    const idx = LEVEL_INDEX_MAP.get(level)
    if (idx !== undefined) {
      this._index = idx
    }
  }

  /** 获取可读状态字符串 */
  toString(): string {
    return `打 ${this.currentLevelName}`
  }
}

// ============================================================
// 升级判定（按「闲家得分」决定等级变化）
//
//   标准双升：**两队各自记级**，本局打「庄家队的级牌」。
//     - 庄家守住（闲家得分 < 80） → 庄家队连庄并升级
//     - 闲家上台（闲家得分 ≥ 80） → 换庄，闲家队升级
// ============================================================

/** 每队各自的级牌（标准双升：本局打庄家队的级牌） */
export type LevelBoard = Record<Team, Rank>

/** 初始级牌：两队都从 2 打起 */
export function initialLevelBoard(): LevelBoard {
  return { [Team.NS]: Rank.Two, [Team.EW]: Rank.Two }
}

/** 某队当前的级牌 */
export function levelOf(board: LevelBoard, team: Team): Rank {
  return board[team]
}

/** 升级结果（纯规则，不含「谁升」） */
export interface LevelChange {
  /** 升级方：'banker' = 庄家连庄升级；'defender' = 闲家上台升级 */
  side: 'banker' | 'defender'
  /** 是否换庄（闲家方成为下局庄家方） */
  switchBanker: boolean
  /** 升级方升几级（0 = 只换庄、不升级） */
  steps: number
}

/**
 * 按「闲家（防守方）得分」判定等级变化（最常见规则）：
 *
 *   0 分            → 庄家连庄，升 3 级
 *   5 – 35 分       → 庄家连庄，升 2 级
 *   40 – 75 分      → 庄家连庄，升 1 级
 *   80 – 115 分     → 换庄，不升级
 *   120 – 155 分    → 换庄，闲家升 1 级
 *   ≥ 160 分        → 换庄，每多 40 分闲家再升 1 级（上不封顶）：
 *                     升级级数 = floor((得分 − 80) / 40)
 *
 * （得分必为 5 的倍数，故 35/40 与 75/80 的边界不产生歧义）
 */
export function calculateLevelChange(defendingPoints: number): LevelChange {
  if (defendingPoints <= 0) {
    return { side: 'banker', switchBanker: false, steps: 3 }
  }
  if (defendingPoints < 40) {
    return { side: 'banker', switchBanker: false, steps: 2 }
  }
  if (defendingPoints < 80) {
    return { side: 'banker', switchBanker: false, steps: 1 }
  }
  return {
    side: 'defender',
    switchBanker: true,
    steps: Math.floor((defendingPoints - 80) / 40),
  }
}

/** 某队升级后的级牌（封顶 A；升过 A 即通关） */
export function advanceLevel(
  current: Rank,
  steps: number,
): { level: Rank; actualSteps: number; gameWon: boolean } {
  const from = LEVEL_INDEX_MAP.get(current) ?? 0
  const to = from + steps
  if (to >= LEVEL_RANKS.length) {
    return {
      level: Rank.Ace,
      actualSteps: LEVEL_RANKS.length - from,
      gameWon: true,
    }
  }
  return { level: LEVEL_RANKS[to], actualSteps: Math.max(0, steps), gameWon: false }
}

/** 一局的等级结算（含升级方、新级牌、下一局庄家） */
export interface LevelSettlement extends LevelChange {
  /** 升级方（队伍） */
  upgradingTeam: Team
  /** 升级前的级牌 */
  fromLevel: Rank
  /** 升级后的级牌 */
  toLevel: Rank
  /** 实际升了几级（到达 A 后封顶） */
  actualSteps: number
  /** 是否通关（升过 A） */
  gameWon: boolean
  /** 下一局庄家（换庄时为原庄家的**下家**，否则不变） */
  nextBanker: PlayerPosition
}

/**
 * 结算一局的等级变化。
 *
 * @param defendingPoints 闲家（防守方）本局总得分（**含抠底**）
 * @param banker 本局庄家
 * @param board 两队当前级牌
 */
export function settleLevel(
  defendingPoints: number,
  banker: PlayerPosition,
  board: LevelBoard,
): LevelSettlement {
  const change = calculateLevelChange(defendingPoints)
  const bankerTeam = teamOf(banker)
  const upgradingTeam = change.side === 'banker'
    ? bankerTeam
    : oppositeTeam(bankerTeam)
  const fromLevel = board[upgradingTeam]
  const { level, actualSteps, gameWon } = advanceLevel(fromLevel, change.steps)
  return {
    ...change,
    upgradingTeam,
    fromLevel,
    toLevel: level,
    actualSteps,
    gameWon,
    nextBanker: change.switchBanker ? nextPlayer(banker) : banker,
  }
}

