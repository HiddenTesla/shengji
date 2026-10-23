// ============================================================
// 出牌控制栏 —— 显示选牌状态 / 合法性提示 / 出牌按钮
// 样式：src/styles/components/_play-bar.scss（BEM）
// ============================================================

import {
  type PlayerPosition,
  POSITION_NAME_ZH,
} from '../core/types.ts';

interface PlayBarProps {
  /** 由谁出牌 */
  player: PlayerPosition;
  /** 是否领出（首出） */
  isLeading: boolean;
  /** 跟出时需要的张数（领出为 null） */
  requiredCount: number | null;
  /** 已选张数 */
  selectedCount: number;
  /** 校验未通过的原因（null = 合法） */
  reason: string | null;
  /** 确认出牌 */
  onPlay: () => void;
  /** 清空选择 */
  onClear: () => void;
  /** 提示：由 AI 选出建议的牌（只选中，不出牌） */
  onHint: () => void;
  compact?: boolean;
  canBeatCurrent?: boolean | null;
  /** 当前本墩最大者是自己的对家（队友） */
  leaderIsPartner?: boolean;
}

export default function PlayBar({
  player,
  isLeading,
  requiredCount,
  selectedCount,
  reason,
  onPlay,
  onClear,
  onHint,
  compact = false,
  canBeatCurrent = null,
  leaderIsPartner = false,
}: PlayBarProps) {
  const canPlay = selectedCount > 0 && reason === null;
  // 打不过队友时不报警：换成中性颜色与柔和措辞
  const beatTone = canBeatCurrent
    ? 'ok'
    : leaderIsPartner ? 'neutral' : 'bad';

  const beatText = canBeatCurrent
    ? (compact ? '能大过' : '能大过当前最大者')
    : leaderIsPartner
      ? (compact ? '对家最大' : '对家最大，不用大过')
      : (compact ? '不能大过' : '不能大过当前最大者');

  return (
    <div className={compact ? 'play-bar play-bar--compact' : 'play-bar'}>
      <div className="play-bar__icon">🃏</div>

      {/* 说明 / 校验提示 */}
      <div className="play-bar__info">
        <div className="play-bar__title">
          {POSITION_NAME_ZH[player]}家出牌
        </div>
        <div className={reason ? 'play-bar__hint play-bar__hint--error' : 'play-bar__hint'}>
          {reason
            ?? (isLeading
              ? '领出：选同一门的任意张数'
              : `跟出：需出 ${requiredCount} 张`)}
        </div>
      </div>

      {canBeatCurrent !== null && (
        <div className={`play-bar__beat play-bar__beat--${beatTone}`}>
          {beatText}
        </div>
      )}

      {/* 已选张数 */}
      <div className="play-bar__count">
        <span className={canPlay
          ? 'play-bar__count-value play-bar__count-value--ok'
          : 'play-bar__count-value'}
        >
          {selectedCount}
        </span>
        {requiredCount !== null && (
          <span className="play-bar__count-total">/{requiredCount}</span>
        )}
      </div>

      {/* 操作 */}
      <div className="play-bar__actions">
        <button
          className="play-bar__button play-bar__button--hint"
          onClick={onHint}
          title="由 AI 选出建议的牌（只选中，不出牌）"
        >
          提示
        </button>
        <button
          className="play-bar__button play-bar__button--clear"
          onClick={onClear}
          disabled={selectedCount === 0}
        >
          清空
        </button>
        <button
          className="play-bar__button play-bar__button--play"
          onClick={onPlay}
          disabled={!canPlay}
        >
          出牌
        </button>
      </div>
    </div>
  );
}
