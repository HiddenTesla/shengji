// ============================================================
// 扣底界面 — 庄家从手牌中选牌埋入底牌
// 样式：src/styles/components/_bottom-cards.scss（BEM）
// ============================================================

import {
  type PlayerPosition,
  POSITION_NAME_ZH,
} from '../core/types.ts';

interface BottomCardsProps {
  /** 庄家方位 */
  banker: PlayerPosition;
  /** 是否托管（AI 自动埋底，无需玩家操作） */
  auto: boolean;
  /** 托管是否因撤销而暂停 */
  paused?: boolean;
  /** 已选张数 */
  selectedCount: number;
  /** 需选张数 */
  requiredCount: number;
  /** 已选牌的总分 */
  buriedPoints: number;
  /** 确认埋底 */
  onConfirm: () => void;
  /** 清空选择 */
  onClear: () => void;
  /** 提示：由 AI 选出建议埋的牌（只选中，不确认） */
  onHint: () => void;
}

export default function BottomCards({
  banker,
  auto,
  paused = false,
  selectedCount,
  requiredCount,
  buriedPoints,
  onConfirm,
  onClear,
  onHint,
}: BottomCardsProps) {
  const full = selectedCount === requiredCount && requiredCount > 0;

  return (
    <div className="bottom-cards">
      {/* 底牌图标 */}
      <div className="bottom-cards__icon">🂠</div>

      {/* 说明 */}
      <div className="bottom-cards__info">
        <div className="bottom-cards__title">
          庄家（{POSITION_NAME_ZH[banker]}家）埋底
        </div>
        <div className="bottom-cards__hint">
          {auto
            ? paused
              ? '托管已暂停（点「继续托管」恢复）'
              : '托管中，AI 正在自动扣底…'
            : `从手牌中选 ${requiredCount} 张埋入底牌（任意牌）`}
        </div>
      </div>

      {/* 已选张数 */}
      <div className="bottom-cards__count">
        <span className={full
          ? 'bottom-cards__count-value bottom-cards__count-value--full'
          : 'bottom-cards__count-value'}
        >
          {selectedCount}
        </span>
        <span className="bottom-cards__count-total">/{requiredCount}</span>
      </div>

      {!auto && (
        <>
          {/* 埋底分（分牌沉底有被抠底风险） */}
          <div className={buriedPoints > 0
            ? 'bottom-cards__points bottom-cards__points--risky'
            : 'bottom-cards__points'}
          >
            埋底分
            {' '}
            <b className={buriedPoints > 0
              ? 'bottom-cards__points-value bottom-cards__points-value--risky'
              : 'bottom-cards__points-value'}
            >
              {buriedPoints}
            </b>
          </div>

          {/* 操作按钮 */}
          <div className="bottom-cards__actions">
            <button
              className="bottom-cards__button bottom-cards__button--hint"
              onClick={onHint}
              title="由 AI 选出建议埋的牌（只选中，不确认）"
            >
              提示
            </button>
            <button
              className="bottom-cards__button bottom-cards__button--clear"
              onClick={onClear}
              disabled={selectedCount === 0}
            >
              清空
            </button>
            <button
              className="bottom-cards__button bottom-cards__button--confirm"
              onClick={onConfirm}
              disabled={!full}
            >
              埋底
            </button>
          </div>
        </>
      )}
    </div>
  );
}
