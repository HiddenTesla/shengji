// ============================================================
// 本局结算面板（步骤 7 · 抠底；步骤 8 · 升级）
//
//   展示：墩数 / 闲家得分 / 庄家逃分 / 合计
//   并翻开底牌，给出末墩拖拉机长度 n、倍数 2^(n+1) 与抠底结果
//   以及按闲家得分判定的等级变化（升几级 / 换庄 / 下一局庄家）
// ============================================================

import { type CSSProperties } from 'react';
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

const BUTTON_STYLE: CSSProperties = {
  padding: '7px 20px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  border: '1px solid rgba(255,215,0,0.6)',
  borderRadius: 7,
  background: 'rgba(255,215,0,0.16)',
  color: '#ffd700',
};

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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '14px 20px',
      borderRadius: 14,
      background: 'linear-gradient(160deg, #12341d, #0b2113)',
      border: '1px solid rgba(255,215,0,0.45)',
      boxShadow: '0 12px 48px rgba(0,0,0,0.55)',
      maxWidth: 520,
    }}>
      {/* 标题 */}
      <div style={{ fontSize: 17, fontWeight: 700, color: '#ffd700' }}>
        🏁 本局结束 · 共 {trickCount} 墩
      </div>

      {/* 得分行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>闲家得分</span>
          <b style={{ fontSize: 22, color: '#7ee787', fontVariantNumeric: 'tabular-nums' }}>
            {defendingPoints}
          </b>
          {taken && (
            <span style={{ fontSize: 12, color: '#7ee787' }}>（含抠底）</span>
          )}
        </span>
        <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>庄家逃分</span>
          <b style={{ fontSize: 22, color: '#ffd700', fontVariantNumeric: 'tabular-nums' }}>
            {bankerPoints}
          </b>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          合计 {total}
        </span>
      </div>

      <span style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />

      {/* 抠底明细 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          🂠 底牌 · 底分 <b style={{ color: '#ffd700' }}>{bottom?.bottomCardPoints ?? 0}</b>
        </span>
        {taken && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            末墩（按领出）{tractorLabel} · 倍数 ×{bottom?.multiplier ?? 2}
          </span>
        )}
        {taken ? (
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#052e16',
            padding: '2px 10px',
            borderRadius: 999,
            background: '#7ee787',
          }}>
            ✅ 闲家抠底成功 +{bottom?.points ?? 0} 分
          </span>
        ) : (
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.75)',
            padding: '2px 10px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
          }}>
            ✗ 闲家未抠底 · 底分不计（×0 倍）
          </span>
        )}
      </div>

      {/* 底牌牌面 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {bottomCards.map(c => (
          <CardComponent key={c.id} card={c} small={true} scale={0.62} />
        ))}
      </div>

      {bottom && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          末墩赢家：{bottom.winner ? `${POSITION_NAME_ZH[bottom.winner]}家` : '—'}
        </div>
      )}

      {/* 升级明细（按闲家得分判定） */}
      {levelSettlement && (
        <>
          <span style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              📈 升级判定 · 闲家方 {defendingPoints} 分 →
              {levelSettlement.side === 'banker' ? ' 庄家连庄' : ' 闲家上台（换庄）'}
            </div>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: levelSettlement.lapUp
                ? '#ffd700'
                : levelSettlement.actualSteps > 0 ? '#7ee787' : 'rgba(255,255,255,0.85)',
            }}>
              {TEAM_NAME_ZH[levelSettlement.upgradingTeam]}队
              {levelSettlement.lapUp
                ? ` 升过 A · 🏆 完成${formatLap(laps[levelSettlement.upgradingTeam])}周目`
                : levelSettlement.actualSteps > 0
                  ? ` 升 ${levelSettlement.actualSteps} 级 → 打 ${RANK_NAME[levelSettlement.toLevel]}`
                  : ' 不升级'}
            </div>
            {levelSettlement.lapUp && (
              <div style={{ fontSize: 13, color: '#7ee787' }}>
                进入第{formatLap(laps[levelSettlement.upgradingTeam] + levelSettlement.lapsGained)}周目
                （从打 {RANK_NAME[levelSettlement.toLevel]} 开始）
              </div>
            )}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              升级后级牌：南北 打{RANK_NAME[nextBoard[Team.NS]]} · 东西 打{RANK_NAME[nextBoard[Team.EW]]}
              ｜下一局庄家：{POSITION_NAME_ZH[levelSettlement.nextBanker]}家
              （本局 {banker ? `${POSITION_NAME_ZH[banker]}家` : '—'}）
            </div>
          </div>
        </>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          下一局打「{nextTeamName}队」的级牌（{nextLevelName}）
          ｜周目 南北 {formatLap(nextLaps[Team.NS])} · 东西 {formatLap(nextLaps[Team.EW])}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onViewPlayLog}
          style={{
            ...BUTTON_STYLE,
            border: '1px solid rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
          }}
        >
          📄 完整日志
        </button>
        <button
          onClick={onNextRound}
          disabled={!levelSettlement}
          style={{ ...BUTTON_STYLE, opacity: levelSettlement ? 1 : 0.5 }}
        >
          ▶ 下一局
        </button>
      </div>
    </div>
  );
}
