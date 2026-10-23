// ============================================================
// 计分板 —— 实时显示「闲家得分」与「庄家逃分」
// 闲家得分达到 80 会变红（上台线）
// 样式：src/styles/components/_score-board.scss（BEM）
// ============================================================

import { cssVars } from '../utils/cssVars.ts';

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
    <div className="score-board">
      {/* 闲家得分 */}
      <div className="score-board__group">
        <span className="score-board__label">闲家得分</span>
        <b className={reached
          ? 'score-board__value score-board__value--defending score-board__value--reached'
          : 'score-board__value score-board__value--defending'}
        >
          {defendingPoints}
        </b>
        <div className="score-board__bar">
          <div
            className={reached
              ? 'score-board__bar-fill score-board__bar-fill--reached'
              : 'score-board__bar-fill'}
            style={cssVars({ '--score-pct': `${pct}%` })}
          />
        </div>
        <span className="score-board__target">/{target}</span>
      </div>

      <span className="score-board__divider" />

      {/* 庄家逃分 */}
      <div className="score-board__group">
        <span className="score-board__label">庄家逃分</span>
        <b className="score-board__value score-board__value--banker">
          {bankerPoints}
        </b>
      </div>

      <span className="score-board__total">
        合计 {total}
      </span>
    </div>
  );
}
