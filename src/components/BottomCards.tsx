// ============================================================
// 扣底界面 — 庄家从手牌中选牌埋入底牌
// ============================================================

import {
  type PlayerPosition,
  POSITION_NAME_ZH,
} from '../core/types.ts'

interface BottomCardsProps {
  /** 庄家方位 */
  banker: PlayerPosition
  /** 是否托管（AI 自动埋底，无需玩家操作） */
  auto: boolean
  /** 已选张数 */
  selectedCount: number
  /** 需选张数 */
  requiredCount: number
  /** 已选牌的总分 */
  buriedPoints: number
  /** 确认埋底 */
  onConfirm: () => void
  /** 清空选择 */
  onClear: () => void
}

export default function BottomCards({
  banker,
  auto,
  selectedCount,
  requiredCount,
  buriedPoints,
  onConfirm,
  onClear,
}: BottomCardsProps) {
  const full = selectedCount === requiredCount && requiredCount > 0

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '8px 16px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.93)',
      border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    }}>
      {/* 底牌图标 */}
      <div style={{ fontSize: 26, lineHeight: 1 }}>🂠</div>

      {/* 说明 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
          庄家（{POSITION_NAME_ZH[banker]}家）埋底
        </div>
        <div style={{ fontSize: 13, color: '#666' }}>
          {auto
            ? '托管中，AI 正在自动扣底…'
            : `从手牌中选 ${requiredCount} 张埋入底牌（任意牌）`}
        </div>
      </div>

      {/* 已选张数 */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 2,
        marginLeft: 4,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1,
          color: full ? '#2e7d32' : '#c62828',
        }}>
          {selectedCount}
        </span>
        <span style={{ fontSize: 15, color: '#888' }}>/{requiredCount}</span>
      </div>

      {!auto && (
        <>
          {/* 埋底分（分牌沉底有被抠底风险） */}
          <div style={{
            fontSize: 14,
            color: '#555',
            padding: '4px 10px',
            borderRadius: 6,
            background: buriedPoints > 0 ? 'rgba(255,152,0,0.15)' : 'rgba(0,0,0,0.05)',
            whiteSpace: 'nowrap',
          }}>
            埋底分 <b style={{ color: buriedPoints > 0 ? '#e65100' : '#333' }}>{buriedPoints}</b>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClear}
              disabled={selectedCount === 0}
              style={{
                padding: '7px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                border: '1.5px solid #bbb',
                borderRadius: 6,
                background: '#f5f5f5',
                color: selectedCount === 0 ? '#aaa' : '#444',
              }}
            >
              清空
            </button>
            <button
              onClick={onConfirm}
              disabled={!full}
              style={{
                padding: '7px 22px',
                fontSize: 14,
                fontWeight: 700,
                cursor: full ? 'pointer' : 'not-allowed',
                border: 'none',
                borderRadius: 6,
                background: full
                  ? 'linear-gradient(135deg, #ffd700, #ffb300)'
                  : '#e0e0e0',
                color: full ? '#1a1a1a' : '#999',
                boxShadow: full ? '0 2px 8px rgba(255,215,0,0.4)' : 'none',
              }}
            >
              埋底
            </button>
          </div>
        </>
      )}
    </div>
  )
}
