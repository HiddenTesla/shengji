// ============================================================
// 底牌查看 —— 以弹窗（modal）的形式查看埋入的 8 张底牌
// 桌中央留给出牌区，底牌不再常驻显示
// 仅当南家为庄（canReveal）时可查看
// ============================================================

import { useState, useEffect } from 'react'
import {
  type Card,
  pointValue,
} from '../core/types.ts'
import CardComponent from './CardComponent.tsx'

interface BottomRevealProps {
  /** 底牌（8 张） */
  cards: Card[]
  /** 是否允许查看（南家为庄） */
  canReveal: boolean
}

export default function BottomReveal({ cards, canReveal }: BottomRevealProps) {
  const [open, setOpen] = useState(false)

  // Esc 关闭弹窗
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!canReveal || cards.length === 0) return null

  const points = cards.reduce((sum, c) => sum + pointValue(c.rank), 0)

  return (
    <>
      {/* 触发按钮（仅占一个小按钮，不占用出牌区） */}
      <button
        onClick={() => setOpen(true)}
        title="查看埋入的底牌"
        style={{
          padding: '4px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          border: '1px solid rgba(255,215,0,0.55)',
          borderRadius: 5,
          background: 'rgba(255,215,0,0.15)',
          color: '#ffd700',
        }}
      >
        🂠 查看底牌
      </button>

      {/* 弹窗 */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              padding: '18px 22px',
              borderRadius: 14,
              background: 'linear-gradient(160deg, #12341d, #0b2113)',
              border: '1px solid rgba(255,215,0,0.45)',
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            }}
          >
            {/* 标题栏 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#ffd700' }}>
                🂠 底牌 · {cards.length} 张
              </span>
              <span style={{
                fontSize: 14,
                color: '#ffd700',
                padding: '2px 10px',
                borderRadius: 6,
                background: 'rgba(255,215,0,0.12)',
              }}>
                底分 {points}
              </span>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '5px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                }}
              >
                关闭
              </button>
            </div>

            {/* 底牌牌面 */}
            <div style={{ display: 'flex', gap: 8 }}>
              {cards.map(c => (
                <CardComponent key={c.id} card={c} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
