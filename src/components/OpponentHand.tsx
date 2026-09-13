// ============================================================
// 东/西/北家手牌（支持显示/隐藏切换）
// ============================================================

import { type PlayerPosition, POSITION_NAME_ZH } from '../core/types.ts'
import CardComponent from './CardComponent.tsx'

interface OpponentHandProps {
  position: PlayerPosition
  cardCount: number
  faceUp: boolean
  showToggle?: boolean
  onToggleVisibility?: () => void
}

/** 牌背重叠偏移 */
const OVERLAP_H = 26 // 水平（北/南）
const OVERLAP_V = 22 // 垂直（东/西）
const CARD_W = 71 * 0.95
const CARD_H = 96 * 0.95

export default function OpponentHand({
  position,
  cardCount,
  faceUp,
  showToggle,
  onToggleVisibility,
}: OpponentHandProps) {
  const label = POSITION_NAME_ZH[position]
  const isSide = position === 'E' || position === 'W'
  const maxShow = Math.min(cardCount, 12)

  if (cardCount === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.75)',
        }}>
          {label}家
        </div>
        <div style={{
          color: 'rgba(255,255,255,0.35)',
          fontSize: 15,
        }}>
          无手牌
        </div>
      </div>
    )
  }

  // ---- 横排（北/南） ----
  if (!isSide) {
    const width = maxShow * OVERLAP_H + CARD_W
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <LabelRow
          label={label}
          faceUp={faceUp}
          showToggle={showToggle}
          onToggleVisibility={onToggleVisibility}
        />
        <div style={{
          position: 'relative',
          width,
          height: CARD_H,
        }}>
          {Array.from({ length: maxShow }).map((_, idx) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: idx * OVERLAP_H,
                zIndex: idx,
              }}
            >
              <CardComponent
                card={{ id: `h-${idx}`, suit: 'S' as any, rank: 2 as any }}
                faceUp={false}
                small
              />
            </div>
          ))}
          {cardCount > 12 && <ExtraBadge count={cardCount - 12} />}
        </div>
        <CardCount count={cardCount} />
      </div>
    )
  }

  // ---- 竖排（东/西） ----
  const height = maxShow * OVERLAP_V + CARD_H
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      <LabelRow
        label={label}
        faceUp={faceUp}
        showToggle={showToggle}
        onToggleVisibility={onToggleVisibility}
      />
      <div style={{
        position: 'relative',
        width: CARD_W + 6,
        height,
      }}>
        {Array.from({ length: maxShow }).map((_, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: idx * OVERLAP_V,
              zIndex: idx,
            }}
          >
            <CardComponent
              card={{ id: `v-${idx}`, suit: 'S' as any, rank: 2 as any }}
              faceUp={false}
              small
            />
          </div>
        ))}
        {cardCount > 12 && <ExtraBadge count={cardCount - 12} side />}
      </div>
      <CardCount count={cardCount} />
    </div>
  )
}

// ---- 子组件 ----

function LabelRow({
  label,
  faceUp,
  showToggle,
  onToggleVisibility,
}: {
  label: string
  faceUp: boolean
  showToggle?: boolean
  onToggleVisibility?: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      <span style={{
        fontSize: 16,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.75)',
      }}>
        {label}家
      </span>
      {showToggle && (
        <button
          onClick={onToggleVisibility}
          style={{
            padding: '3px 9px',
            fontSize: 13,
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 4,
            background: faceUp ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: '#fff',
          }}
        >
          {faceUp ? '隐藏' : '显示'}
        </button>
      )}
    </div>
  )
}

function CardCount({ count }: { count: number }) {
  return (
    <div style={{
      fontSize: 14,
      color: 'rgba(255,255,255,0.45)',
    }}>
      {count} 张
    </div>
  )
}

function ExtraBadge({ count, side }: { count: number; side?: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      ...(side
        ? { bottom: -2, left: '50%', transform: 'translateX(-50%)' }
        : { right: -18, top: 24 }),
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)',
      background: 'rgba(0,0,0,0.3)',
      borderRadius: 8,
      padding: '1px 6px',
      whiteSpace: 'nowrap',
    }}>
      +{count}
    </div>
  )
}

