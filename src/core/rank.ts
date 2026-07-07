// ============================================================
// 等级 & 升级规则
// ============================================================

import {
  Rank,
  RANK_NAME,
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

// ---- 升级判定 ----

export interface UpgradeResult {
  /** 是否换庄 */
  switchBanker: boolean
  /** 庄家升级级数（0=不升级） */
  upgradeSteps: number
  /** 是否通关 */
  gameWon: boolean
}

/**
 * 根据防守方得分判定升级结果
 *
 * 计分规则：
 *   防守方得分 < 40   → 庄家连升 3 级
 *   40 ≤ 得分 < 80    → 庄家连升 2 级
 *   80 ≤ 得分 < 120   → 庄家升 1 级（换庄）
 *   120 ≤ 得分 < 160  → 防守方上台（不升级）
 *   160 ≤ 得分 < 200  → 防守方升 1 级
 *   200 ≤ 得分        → 防守方升 2 级
 *
 * @param defendingPoints 防守方总得分（含底牌分）
 * @param isDefenderBanker 防守方是否为庄家
 * @param manager 等级管理器
 */
export function calculateUpgrade(
  defendingPoints: number,
  isDefenderBanker: boolean,
  manager: RankManager,
): UpgradeResult {
  let upgradeSteps: number
  let switchBanker: boolean

  if (defendingPoints < 40) {
    upgradeSteps = 3
    switchBanker = false // 庄家继续坐庄
  }
  else if (defendingPoints < 80) {
    upgradeSteps = 2
    switchBanker = false
  }
  else if (defendingPoints < 120) {
    upgradeSteps = 1
    switchBanker = true // 换庄
  }
  else if (defendingPoints < 160) {
    upgradeSteps = 0
    switchBanker = true // 防守方上台
  }
  else if (defendingPoints < 200) {
    upgradeSteps = 1
    switchBanker = true
  }
  else {
    upgradeSteps = 2
    switchBanker = true
  }

  // 如果不是防守方坐庄，则升级是对庄家而言
  // 如果防守方不是庄家（即庄家是进攻方），防守方得分高 → 进攻方升级

  let gameWon = false

  if (!isDefenderBanker) {
    // 庄家是进攻方，防守方得分低 → 庄家升级
    if (upgradeSteps > 0 && !switchBanker) {
      const actual = manager.upgrade(upgradeSteps)
      gameWon = manager.isGameWon
      upgradeSteps = actual
    }
    else {
      // 换庄
      switchBanker = true
    }
  }
  else {
    // 庄家是防守方，防守方得分高 → 庄家升级
    if (switchBanker && upgradeSteps > 0) {
      // 防守方作为庄家升级
      const actual = manager.upgrade(upgradeSteps)
      gameWon = manager.isGameWon
      upgradeSteps = actual
      switchBanker = true // 继续坐庄
    }
    else if (!switchBanker && upgradeSteps > 0) {
      // 防守方得分低但防守方是庄家 ? 实际上 defense < 80 时 switchBanker=false
      // 说明庄家（防守方）保庄，升级
      const actual = manager.upgrade(upgradeSteps)
      gameWon = manager.isGameWon
      upgradeSteps = actual
    }
    else {
      // 进攻方上台
      switchBanker = true
      upgradeSteps = 0
    }
  }

  return {
    switchBanker,
    upgradeSteps,
    gameWon,
  }
}

/**
 * 简化版升级判定
 * @param bankerTeamPoints 庄家队伍得分
 * @param defenderTeamPoints 防守队伍得分
 * @param isBankerAttacker 庄家是否为进攻方（即是否叫主成功那方）
 */
export function simpleUpgrade(
  bankerTeamPoints: number,
  defenderTeamPoints: number,
  isBankerAttacker: boolean,
  manager: RankManager,
): UpgradeResult {
  // 如果庄家是进攻方，防守方得分是关键
  // 如果庄家是防守方，则庄家自己的得分是关键
  const keyPoints = isBankerAttacker
    ? defenderTeamPoints
    : bankerTeamPoints

  return calculateUpgrade(keyPoints, !isBankerAttacker, manager)
}

