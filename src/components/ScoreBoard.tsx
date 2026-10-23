// ============================================================
// 计分板 —— 实时显示「闲家得分」与「庄家逃分」
// 闲家得分达到 80 会变红（上台线）
// ============================================================

interface ScoreBoardProps {
  /** 闲家（进攻方）得分 */
  defendingPoints: number;
  /** 庄家（防守方）逃分 */
  bankerPoints: number;
  /** 上台线（默认 80） */
  target?: number;
}

export default function ScoreBoard({
  defendingPoints,
  bankerPoints,
  target = 80,
}: ScoreBoardProps) {
  const total = defendingPoints + bankerPoints;
  const reached = defendingPoints >= target;
  const pct = Math.min(100, (defendingPoints / target) * 100);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '5px 16px',
      borderRadius: 10,
      background: 'rgba(0,0,0,0.32)',
      border: '1px solid rgba(255,255,255,0.12)',
    }}>
      {/* 闲家得分 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>闲家得分</span>
        <b style={{
          fontSize: 21,
          lineHeight: 1,
          color: reached ? '#ff5252' : '#7ee787',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {defendingPoints}
        </b>
        <div style={{
          width: 104,
          height: 6,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.15)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: reached ? '#ff5252' : '#7ee787',
            transition: 'width 0.25s',
          }} />
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>/{target}</span>
      </div>

      <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)' }} />

      {/* 庄家逃分 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>庄家逃分</span>
        <b style={{
          fontSize: 21,
          lineHeight: 1,
          color: '#ffd700',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {bankerPoints}
        </b>
      </div>

      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
        合计 {total}
      </span>
    </div>
  );
}
