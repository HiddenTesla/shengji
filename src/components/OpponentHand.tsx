// ============================================================
// 东/西/北家手牌（支持显示/隐藏切换）
//
// 翻开时：
//   - 北家与南家一致 —— 按「门」横向分组显示（主牌 / ♠ / ♥ / ♣ / ♦）
//   - 东/西家按「门」分为若干竖列，同一门内竖排，逐张可见点数与花色
// ============================================================

import {
  type Card,
  type PlayerPosition,
  type Rank,
  type Suit,
  POSITION_NAME_ZH,
} from '../core/types.ts'
import { type CardGroup, groupCardsForDisplay } from '../core/card.ts'
import CardComponent from './CardComponent.tsx'
import PlayerHand from './PlayerHand.tsx'

interface OpponentHandProps {
  position: PlayerPosition
  /** 该家手牌 */
  cards: Card[]
  /** 当前级牌 */
  levelRank: Rank
  /** 主花色（null = 无主 / 尚未定主） */
  trumpSuit: Suit | null
  faceUp: boolean
  showToggle?: boolean
  onToggleVisibility?: () => void
}

/** 牌背重叠偏移 */
const OVERLAP_H = 26 // 水平（北/南）
const OVERLAP_V = 22 // 垂直（东/西）
const CARD_W = 71 * 0.95
const CARD_H = 96 * 0.95

/** 东/西家翻开时：同一门内竖排的步长（保证点数与花色可见） */
const SIDE_STEP_Y = 42
/**
 * 东/西家翻开时：每列最多张数，超出则同一门拆成多列。
 * 取 6 使翻开后的竖列不高于牌背竖排，避免挤占南家手牌空间。
 */
const SIDE_ROWS_PER_COL = 6

/** 北家翻开时的固定高度（与南家分组展示等高，避免切换时位置跳动） */
const TOP_REVEAL_H = 142

/** 门标签颜色 */
const GROUP_COLORS: Record<string, string> = {
  S: '#111111',
  H: '#c62828',
  C: '#1b5e20',
  D: '#e65100',
  trump: '#ffd700',
}

export default function OpponentHand({
  position,
  cards,
  levelRank,
  trumpSuit,
  faceUp,
  showToggle,
  onToggleVisibility,
}: OpponentHandProps) {
  const label = POSITION_NAME_ZH[position]
  const isSide = position === 'E' || position === 'W'
  const cardCount = cards.length
  const maxShow = Math.min(cardCount, 12)
  const groups = groupCardsForDisplay(cards, trumpSuit, levelRank)

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

  // ---- 横排（北家） ----
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
        {/* 固定高度：显示/隐藏切换时按钮位置不变 */}
        <div style={{
          height: TOP_REVEAL_H,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}>
          {faceUp ? (
            <PlayerHand groups={groups} />
          ) : (
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
          )}
        </div>
        <CardCount count={cardCount} />
      </div>
    )
  }

  // ---- 竖排（东/西） ----
  const backHeight = maxShow * OVERLAP_V + CARD_H
  const revealHeight =
    (Math.min(cardCount, SIDE_ROWS_PER_COL) - 1) * SIDE_STEP_Y + CARD_H
  // 固定高度 + 以外缘为锚点：显示/隐藏切换时按钮位置不变
  const sideAreaHeight = Math.max(backHeight, revealHeight)
  const sideAlign = position === 'W' ? 'flex-start' : 'flex-end'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: sideAlign,
      gap: 4,
    }}>
      <LabelRow
        label={label}
        faceUp={faceUp}
        showToggle={showToggle}
        onToggleVisibility={onToggleVisibility}
      />
      <div style={{
        height: sideAreaHeight,
        display: 'flex',
        alignItems: 'flex-start',
      }}>
        {faceUp ? (
          <SideGroupColumns groups={groups} />
        ) : (
          <div style={{
            position: 'relative',
            width: CARD_W + 6,
            height: backHeight,
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
        )}
      </div>
      <CardCount count={cardCount} />
    </div>
  )
}

// ---- 子组件 ----

/** 东/西家翻开：按「门」分列，同一门内竖排（必要时同门拆成多列） */
function SideGroupColumns({ groups }: { groups: CardGroup[] }) {
  if (groups.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      {groups.map(group => {
        const n = group.cards.length
        const colCount = Math.max(1, Math.ceil(n / SIDE_ROWS_PER_COL))
        const rows = Math.min(n, SIDE_ROWS_PER_COL)
        const height = (rows - 1) * SIDE_STEP_Y + CARD_H

        return (
          <div
            key={String(group.kind)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <GroupLabel group={group} />

            <div style={{ display: 'flex', flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: colCount }).map((_, ci) => (
                <div
                  key={ci}
                  style={{ position: 'relative', width: CARD_W, height }}
                >
                  {group.cards
                    .slice(ci * SIDE_ROWS_PER_COL, (ci + 1) * SIDE_ROWS_PER_COL)
                    .map((card, i) => (
                      <div
                        key={card.id}
                        style={{
                          position: 'absolute',
                          top: i * SIDE_STEP_Y,
                          zIndex: i,
                        }}
                      >
                        <CardComponent card={card} faceUp small />
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 门标签：主牌 / ♠ 等 + 张数 */
function GroupLabel({ group }: { group: CardGroup }) {
  const color = GROUP_COLORS[group.kind] ?? 'rgba(255,255,255,0.7)'
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 16,
      fontWeight: 700,
      color,
    }}>
      <span>{group.label}</span>
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.55)',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '0 5px',
        lineHeight: '16px',
      }}>
        {group.cards.length}
      </span>
    </div>
  )
}

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

