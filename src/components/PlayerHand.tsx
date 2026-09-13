// ============================================================
// 南家手牌（升级分组展示，可点击选中）
// ============================================================

import { type CardGroup } from '../core/card.ts'
import CardComponent from './CardComponent.tsx'

interface PlayerHandProps {
  groups: CardGroup[]
  /** 选中项（只读展示时可省略） */
  selectedIndices?: Set<number>
  /** 点击选牌（只读展示时可省略） */
  onToggleCard?: (index: number) => void
}

/** 手牌重叠偏移量 */
const OVERLAP = 34
/** 组间距 */
const GROUP_GAP = 16
/** 手牌缩放后单牌宽度 */
const CARD_W_SMALL = 71 * 0.95
/** 手牌缩放后单牌高度 */
const CARD_H_SMALL = 96 * 0.95

/** 花色颜色映射 — 与卡牌一致 */
const SUIT_COLORS: Record<string, string> = {
  S: '#111111',   // 黑桃
  H: '#c62828',   // 红心
  C: '#1b5e20',   // 梅花
  D: '#e65100',   // 方块
  trump: '#ffd700',
}

export default function PlayerHand({
  groups,
  selectedIndices,
  onToggleCard,
}: PlayerHandProps) {
  if (groups.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
      }}>
        无手牌
      </div>
    )
  }

  let globalIdx = 0

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      padding: '4px 0',
      gap: GROUP_GAP,
      overflow: 'hidden',
      maxWidth: '100%',
    }}>
      {groups.map((group) => {
        const groupStartIdx = globalIdx
        globalIdx += group.cards.length
        return (
          <GroupSection
            key={String(group.kind)}
            group={group}
            groupStartIdx={groupStartIdx}
            selectedIndices={selectedIndices}
            onToggleCard={onToggleCard}
          />
        )
      })}
    </div>
  )
}

function GroupSection({
  group,
  groupStartIdx,
  selectedIndices,
  onToggleCard,
}: {
  group: CardGroup
  groupStartIdx: number
  selectedIndices?: Set<number>
  onToggleCard?: (index: number) => void
}) {
  const count = group.cards.length
  const width = (count - 1) * OVERLAP + CARD_W_SMALL
  const color = SUIT_COLORS[group.kind] ?? 'rgba(255,255,255,0.6)'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      {/* 组标签：彩色图标 + 张数 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 18,
        fontWeight: 700,
        color,
        padding: '3px 10px',
        borderRadius: 4,
        background: group.kind === 'trump'
          ? 'rgba(255,215,0,0.12)'
          : 'rgba(255,255,255,0.06)',
        whiteSpace: 'nowrap',
      }}>
        <span>{group.label}</span>
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.55)',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '0 6px',
          lineHeight: '18px',
        }}>
          {count}
        </span>
      </div>

      {/* 牌 */}
      <div style={{
        position: 'relative',
        width,
        height: CARD_H_SMALL + 8,
      }}>
        {group.cards.map((card, idx) => {
          const globalIdx = groupStartIdx + idx
          const isSelected = selectedIndices?.has(globalIdx) ?? false
          return (
            <div
              key={card.id}
              style={{
                position: 'absolute',
                left: idx * OVERLAP,
                zIndex: idx,
                transition: 'transform 0.15s, filter 0.15s',
              }}
            >
              <CardComponent
                card={card}
                faceUp
                small
                selected={isSelected}
                onClick={onToggleCard
                  ? () => onToggleCard(globalIdx)
                  : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

