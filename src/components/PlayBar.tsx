// ============================================================
// 出牌控制栏 —— 显示选牌状态 / 合法性提示 / 出牌按钮
// ============================================================

import {
  type PlayerPosition,
  POSITION_NAME_ZH,
} from '../core/types.ts'

interface PlayBarProps {
  /** 由谁出牌 */
  player: PlayerPosition
  /** 是否领出（首出） */
  isLeading: boolean
  /** 跟出时需要的张数（领出为 null） */
  requiredCount: number | null
  /** 已选张数 */
  selectedCount: number
  /** 校验未通过的原因（null = 合法） */
  reason: string | null
  /** 确认出牌 */
  onPlay: () => void
  /** 清空选择 */
  onClear: () => void
  /** 提示：由 AI 选出建议的牌（只选中，不出牌） */
  onHint: () => void
  compact?: boolean
  canBeatCurrent?: boolean | null
  /** 当前本墩最大者是自己的对家（队友） */
  leaderIsPartner?: boolean
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
  const canPlay = selectedCount > 0 && reason === null
  // 打不过队友时不报警：换成中性颜色与柔和措辞
  const beatTone = canBeatCurrent
    ? '#2e7d32'
    : leaderIsPartner ? '#7a7a7a' : '#c62828'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 8 : 14,
      padding: compact ? '6px 8px' : '8px 16px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.93)',
      border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      maxWidth: compact ? 300 : undefined,
    }}>
      <div style={{ fontSize: compact ? 18 : 24, lineHeight: 1 }}>🃏</div>

      {/* 说明 / 校验提示 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: '#1a1a1a' }}>
          {POSITION_NAME_ZH[player]}家出牌
        </div>
        <div style={{
          fontSize: compact ? 11 : 13,
          color: reason ? '#c62828' : '#666',
        }}>
          {reason
            ?? (isLeading
              ? '领出：选同一门的任意张数'
              : `跟出：需出 ${requiredCount} 张`)}
        </div>
      </div>

      {canBeatCurrent !== null && (
        <div style={{
          maxWidth: compact ? 90 : 130,
          fontSize: compact ? 11 : 12,
          lineHeight: 1.25,
          fontWeight: leaderIsPartner && !canBeatCurrent ? 500 : 600,
          color: beatTone,
        }}>
          {canBeatCurrent
            ? (compact ? '能大过' : '能大过当前最大者')
            : leaderIsPartner
              ? (compact ? '对家最大' : '对家最大，不用大过')
              : (compact ? '不能大过' : '不能大过当前最大者')}
        </div>
      )}

      {/* 已选张数 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <span style={{
          fontSize: compact ? 20 : 24,
          fontWeight: 800,
          lineHeight: 1,
          color: canPlay ? '#2e7d32' : '#c62828',
        }}>
          {selectedCount}
        </span>
        {requiredCount !== null && (
          <span style={{ fontSize: 15, color: '#888' }}>/{requiredCount}</span>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onHint}
          title="由 AI 选出建议的牌（只选中，不出牌）"
          style={{
            padding: compact ? '5px 9px' : '7px 16px',
            fontSize: compact ? 12 : 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            border: '1.5px solid #7e57c2',
            borderRadius: 6,
            background: '#f3e9ff',
            color: '#5e35b1',
          }}
        >
          提示
        </button>
        <button
          onClick={onClear}
          disabled={selectedCount === 0}
          style={{
            padding: compact ? '5px 9px' : '7px 16px',
            fontSize: compact ? 12 : 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
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
          onClick={onPlay}
          disabled={!canPlay}
          style={{
            padding: compact ? '5px 11px' : '7px 22px',
            fontSize: compact ? 12 : 14,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            cursor: canPlay ? 'pointer' : 'not-allowed',
            border: 'none',
            borderRadius: 6,
            background: canPlay
              ? 'linear-gradient(135deg, #ffd700, #ffb300)'
              : '#e0e0e0',
            color: canPlay ? '#1a1a1a' : '#999',
            boxShadow: canPlay ? '0 2px 8px rgba(255,215,0,0.4)' : 'none',
          }}
        >
          出牌
        </button>
      </div>
    </div>
  )
}
