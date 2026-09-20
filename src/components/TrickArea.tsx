// ============================================================
// 出牌区 —— 牌桌中央显示本墩四家的出牌
// 布局：北在上、南在下、西在左、东在右，中央为墩信息
// ============================================================

import {
  type Card,
  PlayerPosition,
  POSITION_NAME_ZH,
} from '../core/types.ts'
import { type PlayState, doorLabel } from '../core/play.ts'
import CardComponent from './CardComponent.tsx'

interface TrickAreaProps {
  state: PlayState
}

/** 出牌区用的牌缩放（比手牌更小） */
const CARD_SCALE = 0.62
const CARD_W = 71 * CARD_SCALE
const CARD_H = 96 * CARD_SCALE
/** 一手多张牌时的重叠步长上限 */
const STEP_MAX = 26
/** 每手牌区域宽度（多张牌在此宽度内压缩重叠） */
const SLOT_W = 168

/** 四家在本墩中的方位 */
const SLOTS: { player: PlayerPosition; col: number; row: number }[] = [
  { player: PlayerPosition.North, col: 2, row: 1 },
  { player: PlayerPosition.West, col: 1, row: 2 },
  { player: PlayerPosition.East, col: 3, row: 2 },
  { player: PlayerPosition.South, col: 2, row: 3 },
]

export default function TrickArea({ state }: TrickAreaProps) {
  const { trick } = state
  const trickNo = state.tricks.length + 1
  const leadLabel = trick.leadDoor ? doorLabel(trick.leadDoor) : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto auto auto',
      gridTemplateRows: 'auto auto auto',
      alignItems: 'center',
      justifyItems: 'center',
      gap: 2,
      padding: '8px 14px',
      borderRadius: 12,
      background: 'rgba(0,0,0,0.28)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {SLOTS.map(slot => {
        const play = trick.plays.find(p => p.player === slot.player)
        return (
          <div key={slot.player} style={{ gridColumn: slot.col, gridRow: slot.row }}>
            <PlaySlot
              player={slot.player}
              cards={play?.cards ?? []}
              isWinner={trick.complete && trick.winner === slot.player}
              isLead={trick.leadPlayer === slot.player}
            />
          </div>
        )
      })}

      {/* 中央：墩信息 */}
      <div style={{
        gridColumn: 2,
        gridRow: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        minWidth: 82,
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
          第 {trickNo} 墩
        </div>
        {leadLabel && <div>首出 {leadLabel}</div>}
        {trick.leadCount > 0 && <div>{trick.leadCount} 张</div>}
        {trick.complete && trick.winner && (
          <div style={{ color: '#ffd700' }}>
            {POSITION_NAME_ZH[trick.winner]}家赢
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------

function PlaySlot({
  player,
  cards,
  isWinner,
  isLead,
}: {
  player: PlayerPosition
  cards: Card[]
  isWinner: boolean
  isLead: boolean
}) {
  const n = cards.length
  const step = n > 1 ? Math.min(STEP_MAX, (SLOT_W - CARD_W) / (n - 1)) : 0
  const cardsWidth = n > 0 ? (n - 1) * step + CARD_W : CARD_W

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      {/* 方位标签 */}
      <div style={{
        fontSize: 12,
        fontWeight: isWinner ? 700 : 500,
        color: isWinner
          ? '#ffd700'
          : isLead
            ? 'rgba(255,255,255,0.85)'
            : 'rgba(255,255,255,0.45)',
        whiteSpace: 'nowrap',
      }}>
        {POSITION_NAME_ZH[player]}家
        {isWinner ? ' 🏆' : isLead ? ' · 首出' : ''}
      </div>

      {/* 牌 */}
      <div style={{
        width: SLOT_W,
        height: CARD_H,
        display: 'flex',
        justifyContent: 'center',
      }}>
        <div style={{ position: 'relative', width: cardsWidth, height: CARD_H }}>
          {cards.map((c, i) => (
            <div
              key={c.id}
              style={{
                position: 'absolute',
                left: i * step,
                top: 0,
                zIndex: i,
              }}
            >
              <CardComponent card={c} faceUp small scale={CARD_SCALE} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
