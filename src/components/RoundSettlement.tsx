// ============================================================
// 本局结算面板（步骤 7 · 抠底；步骤 8 · 升级）
//
//   展示：墩数 / 闲家得分 / 庄家逃分 / 合计
//   并翻开底牌，给出末墩拖拉机长度 n、倍数 2^(n+1) 与抠底结果
//   以及按闲家得分判定的等级变化（升几级 / 换庄 / 下一局庄家）
// ============================================================

import { type BottomSettlement } from '../core/scoring.ts';
import { type LevelBoard, type LevelSettlement, type LapBoard, formatLap } from '../core/rank.ts';
import {
  type Card,
  PlayerPosition,
  POSITION_NAME_ZH,
  RANK_NAME,
  Team,
  TEAM_NAME_ZH,
} from '../core/types.ts';
import CardComponent from './CardComponent.tsx';

interface RoundSettlementProps {
  /** 本局墩数 */
  trickCount: number;
  /** 闲家得分（若抠底，已含「底牌分 × 倍数」） */
  defendingPoints: number;
  /** 庄家逃分 */
  bankerPoints: number;
  /** 抠底结算结果 */
  bottom: BottomSettlement | null;
  /** 埋底的 8 张底牌 */
  bottomCards: Card[];
  /** 本局庄家 */
  banker: PlayerPosition | null;
  /** 两队当前级牌 */
  levels: LevelBoard;
  /** 两队当前周目（本局结算后若要 +1，由这里推导） */
  laps: LapBoard;
  /** 等级结算（升几级 / 换庄 / 周目） */
  levelSettlement: LevelSettlement | null;
  /** 点击「完整日志」：由 App 打开本局日志（可导出 JSON / JSONC） */
  onViewPlayLog: () => void;
  /** 点击「下一局」 */
  onNextRound: () => void;
}

export default function RoundSettlement({
  trickCount,
  defendingPoints,
  bankerPoints,
  bottom,
  bottomCards,
  banker,
  levels,
  laps,
  levelSettlement,
  onViewPlayLog,
  onNextRound,
}: RoundSettlementProps) {
  const total = defendingPoints + bankerPoints;
  const taken = bottom?.taken ?? false;
  // 升级后的级牌（用于展示「下一局」会打几）
  const nextBoard: LevelBoard = levelSettlement
    ? { ...levels, [levelSettlement.upgradingTeam]: levelSettlement.toLevel }
    : levels;
  const nextTeamName = levelSettlement
    ? TEAM_NAME_ZH[levelSettlement.upgradingTeam]
    : '—';
  const nextLevelName = levelSettlement
    ? RANK_NAME[levelSettlement.toLevel]
    : '—';
  // 下一局的周目（升过 A 的队按完成周目数累加）
  const nextLaps: LapBoard = levelSettlement?.lapUp
    ? {
        ...laps,
        [levelSettlement.upgradingTeam]:
          laps[levelSettlement.upgradingTeam] + levelSettlement.lapsGained,
      }
    : laps;
  const tractorLabel = bottom
    ? bottom.tractorLength === 0
      ? '无对子'
      : bottom.tractorLength === 1
        ? '1 个对子'
        : `${bottom.tractorLength} 连对（拖拉机）`
    : '—';

  const levelLineClass = levelSettlement?.lapUp
    ? 'settlement__level-line settlement__level-line--gold'
    : levelSettlement && levelSettlement.actualSteps > 0
      ? 'settlement__level-line settlement__level-line--green'
      : 'settlement__level-line';

  return (
    <div className="settlement">
      {/* 标题 */}
      <div className="settlement__title">
        🏁 本局结束 · 共 {trickCount} 墩
      </div>

      {/* 得分行 */}
      <div className="settlement__scores">
        <span className="settlement__score-group">
          <span className="settlement__label">闲家得分</span>
          <b className="settlement__value settlement__value--green">
            {defendingPoints}
          </b>
          {taken && (
            <span className="settlement__note">（含抠底）</span>
          )}
        </span>
        <span className="settlement__divider settlement__divider--vertical" />
        <span className="settlement__score-group">
          <span className="settlement__label">庄家逃分</span>
          <b className="settlement__value settlement__value--gold">
            {bankerPoints}
          </b>
        </span>
        <span className="settlement__spacer" />
        <span className="settlement__total">
          合计 {total}
        </span>
      </div>

      <span className="settlement__divider" />

      {/* 抠底明细 */}
      <div className="settlement__bottom-row">
        <span className="settlement__bottom-title">
          🂠 底牌 · 底分
          {' '}
          <b className="settlement__bottom-points">{bottom?.bottomCardPoints ?? 0}</b>
        </span>
        {taken && (
          <span className="settlement__bottom-meta">
            末墩（按领出）{tractorLabel} · 倍数 ×{bottom?.multiplier ?? 2}
          </span>
        )}
        {taken ? (
          <span className="settlement__pill settlement__pill--taken">
            ✅ 闲家抠底成功 +{bottom?.points ?? 0} 分
          </span>
        ) : (
          <span className="settlement__pill settlement__pill--missed">
            ✗ 闲家未抠底 · 底分不计（×0 倍）
          </span>
        )}
      </div>

      {/* 底牌牌面 */}
      <div className="settlement__cards">
        {bottomCards.map(c => (
          <CardComponent key={c.id} card={c} small={true} scale={0.62} />
        ))}
      </div>

      {bottom && (
        <div className="settlement__winner">
          末墩赢家：{bottom.winner ? `${POSITION_NAME_ZH[bottom.winner]}家` : '—'}
        </div>
      )}

      {/* 升级明细（按闲家得分判定） */}
      {levelSettlement && (
        <>
          <span className="settlement__divider" />
          <div className="settlement__level">
            <div className="settlement__level-title">
              📈 升级判定 · 闲家方 {defendingPoints} 分 →
              {levelSettlement.side === 'banker' ? ' 庄家连庄' : ' 闲家上台（换庄）'}
            </div>
            <div className={levelLineClass}>
              {TEAM_NAME_ZH[levelSettlement.upgradingTeam]}队
              {levelSettlement.lapUp
                ? ` 升过 A · 🏆 完成${formatLap(laps[levelSettlement.upgradingTeam])}周目`
                : levelSettlement.actualSteps > 0
                  ? ` 升 ${levelSettlement.actualSteps} 级 → 打 ${RANK_NAME[levelSettlement.toLevel]}`
                  : ' 不升级'}
            </div>
            {levelSettlement.lapUp && (
              <div className="settlement__level-detail">
                进入第{formatLap(laps[levelSettlement.upgradingTeam] + levelSettlement.lapsGained)}周目
                （从打 {RANK_NAME[levelSettlement.toLevel]} 开始）
              </div>
            )}
            <div className="settlement__level-next">
              升级后级牌：南北 打{RANK_NAME[nextBoard[Team.NS]]} · 东西 打{RANK_NAME[nextBoard[Team.EW]]}
              ｜下一局庄家：{POSITION_NAME_ZH[levelSettlement.nextBanker]}家
              （本局 {banker ? `${POSITION_NAME_ZH[banker]}家` : '—'}）
            </div>
          </div>
        </>
      )}

      {/* 操作按钮 */}
      <div className="settlement__footer">
        <span className="settlement__footer-text">
          下一局打「{nextTeamName}队」的级牌（{nextLevelName}）
          ｜周目 南北 {formatLap(nextLaps[Team.NS])} · 东西 {formatLap(nextLaps[Team.EW])}
        </span>
        <span className="settlement__spacer" />
        <button
          className="settlement__button settlement__button--ghost"
          onClick={onViewPlayLog}
        >
          📄 完整日志
        </button>
        <button
          className="settlement__button"
          onClick={onNextRound}
          disabled={!levelSettlement}
        >
          ▶ 下一局
        </button>
      </div>
    </div>
  );
}
