// ============================================================
// 出牌区 —— 牌桌中央显示本墩四家的出牌
// 布局：北在上、南在下、西在左、东在右，中央为墩信息
// ============================================================

import { useState } from 'react'
import {
  type Card,
  PlayerPosition,
  POSITION_NAME_ZH,
  type Rank,
  type Suit,
} from '../core/types.ts'
import {
  type PlayState,
  currentTrickLeader,
  doorLabel,
} from '../core/play.ts'
import { trickPoints } from '../core/scoring.ts'
import CardComponent from './CardComponent.tsx'

interface TrickAreaProps {
  state: PlayState
  trumpSuit: Suit | null
  levelRank: Rank
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

/** 「轮到谁出牌」箭头：指向该玩家所在方位（牌未出，空位上显示） */
const TURN_ARROW: Record<PlayerPosition, string> = {
  [PlayerPosition.North]: '▲',
  [PlayerPosition.South]: '▼',
  [PlayerPosition.West]: '◀',
  [PlayerPosition.East]: '▶',
}

export default function TrickArea({ state, trumpSuit, levelRank }: TrickAreaProps) {
  const { trick } = state
  const trickNo = state.tricks.length + 1
  const leadLabel = trick.leadDoor ? doorLabel(trick.leadDoor) : null
  const curPoints = trickPoints(trick.plays.flatMap(p => p.cards))
  const currentLeader = currentTrickLeader(trick, trumpSuit, levelRank)
  // 折叠框：记录「当前展开的是哪一墩」，换墩后自然回到收起
  const [openTrick, setOpenTrick] = useState<number | null>(null)

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
        const isLeadSlot = play && play.player === trick.leadPlayer
        return (
          <div key={slot.player} style={{ gridColumn: slot.col, gridRow: slot.row }}>
            <PlaySlot
              player={slot.player}
              cards={play?.cards ?? []}
              attempt={isLeadSlot ? trick.throwAttempt : []}
              attemptOpen={openTrick === trickNo}
              onToggleAttempt={() => setOpenTrick(openTrick === trickNo ? null : trickNo)}
              isCurrentMax={currentLeader === slot.player}
              isWinner={trick.complete && trick.winner === slot.player}
              isLead={trick.leadPlayer === slot.player}
              isTurn={!trick.complete && state.turn === slot.player}
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
        {curPoints > 0 && (
          <div style={{ color: '#7ee787', fontWeight: 600 }}>本墩 {curPoints} 分</div>
        )}
        {currentLeader && (
          <div style={{ color: '#ffd700', fontWeight: 700 }}>
            当前最大：{POSITION_NAME_ZH[currentLeader]}家
          </div>
        )}
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
  attempt,
  attemptOpen,
  onToggleAttempt,
  isCurrentMax,
  isWinner,
  isLead,
  isTurn,
}: {
  player: PlayerPosition
  cards: Card[]
  /** 甩牌失败时「原本想甩的牌」（本墩内展示在实际出牌旁） */
  attempt: Card[]
  /** 「欲甩的牌」折叠框是否展开 */
  attemptOpen: boolean
  onToggleAttempt: () => void
  isCurrentMax: boolean
  isWinner: boolean
  isLead: boolean
  /** 是否轮到该玩家出牌（空位上显示箭头） */
  isTurn: boolean
}) {
  const n = cards.length
  const step = n > 1 ? Math.min(STEP_MAX, (SLOT_W - CARD_W) / (n - 1)) : 0
  const cardsWidth = n > 0 ? (n - 1) * step + CARD_W : CARD_W

  // 折叠框浮层：往牌桌外侧展开（西家向左，其余向右），不影响布局
  const sideLeft = player === PlayerPosition.West

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
        fontWeight: isCurrentMax || isTurn ? 700 : 500,
        color: isCurrentMax || isTurn
          ? '#ffd700'
          : isLead
            ? 'rgba(255,255,255,0.85)'
            : 'rgba(255,255,255,0.45)',
        whiteSpace: 'nowrap',
      }}>
        {POSITION_NAME_ZH[player]}家
        {isWinner ? ' 🏆' : isTurn ? ' · 出牌' : isCurrentMax ? ' · 当前最大' : isLead ? ' · 首出' : ''}
      </div>

      {/* 牌 */}
      <div style={{
        position: 'relative',
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

          {/* 甩牌失败：折叠框展示「欲甩的牌」（收起时只留一个标签） */}
          {attempt.length > 0 && (
            <div style={{
              position: 'absolute',
              top: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: sideLeft ? 'flex-end' : 'flex-start',
              gap: 4,
              zIndex: 30,
              ...(sideLeft ? { right: cardsWidth + 6 } : { left: cardsWidth + 6 }),
            }}>
              <button
                onClick={onToggleAttempt}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  color: '#ff8a80',
                  borderRadius: 999,
                  background: 'rgba(120,20,20,0.9)',
                  border: '1px solid rgba(255,138,128,0.65)',
                }}
              >
                ✗ 甩牌失败 · 欲甩 {attempt.length} 张 {attemptOpen ? '▾' : '▸'}
              </button>
              {attemptOpen && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: 6,
                  borderRadius: 8,
                  background: 'rgba(18,12,12,0.96)',
                  border: '1px solid rgba(255,138,128,0.5)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
                }}>
                  <div style={{ fontSize: 11, color: '#ff8a80', fontWeight: 700 }}>
                    欲甩的牌（被拦，已改出最小的一组）
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 3,
                    maxWidth: 4 * (CARD_W + 3),
                  }}>
                    {attempt.map(c => (
                      <CardComponent key={c.id} card={c} faceUp small scale={CARD_SCALE} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 轮到该玩家：空位上显示指向其方位的脉动箭头 */}
        {isTurn && n === 0 && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            lineHeight: 1,
            color: '#ffd700',
            textShadow: '0 0 14px rgba(255,215,0,0.8)',
            animation: 'turnPulse 1.1s ease-in-out infinite',
            pointerEvents: 'none',
          }}>
            {TURN_ARROW[player]}
          </div>
        )}
      </div>
    </div>
  )
}
