// ============================================================
// 出牌记录弹窗
//
//   mode="plays"：「查看 → 出牌记录」，只显示本局的出牌（不含发牌 / 底牌）
//   mode="full" ：本局结算时显示完整日志，并可导出 JSON / JSONC
// ============================================================

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  type PlayRecord,
  type RoundRecord,
  decodeCardId,
} from '../core/playlog.ts'
import {
  HandType,
  POSITION_NAME_ZH,
} from '../core/types.ts'
import CardComponent from './CardComponent.tsx'

interface PlayLogDialogProps {
  open: boolean
  mode: 'plays' | 'full'
  record: RoundRecord | null
  /** 生成完整日志文本（默认 JSON） */
  serialize: (format: 'json' | 'jsonc') => string
  onExport: (format: 'json' | 'jsonc') => void
  onClose: () => void
}

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 110,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.6)',
}

const PANEL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 'min(760px, calc(100vw - 40px))',
  maxHeight: '84vh',
  padding: '16px 18px 14px',
  borderRadius: 12,
  background: '#1e2b1e',
  border: '1px solid rgba(255,255,255,0.2)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  color: 'rgba(255,255,255,0.88)',
}

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 12,
}

const TITLE_STYLE: CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  color: '#fff',
}

const CLOSE_STYLE: CSSProperties = {
  marginLeft: 'auto',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  background: 'transparent',
  color: 'rgba(255,255,255,0.75)',
  fontSize: 16,
  cursor: 'pointer',
}

const FOOTER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 12,
}

const BUTTON_STYLE: CSSProperties = {
  padding: '7px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
}

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  border: '1px solid rgba(255,215,0,0.6)',
  background: 'rgba(255,215,0,0.16)',
  color: '#ffd700',
}

function shapeLabel(shape: PlayRecord['shape'], isLead: boolean): string {
  switch (shape.type) {
    case HandType.Single:
      return '单张'
    case HandType.Pair:
      return '对子'
    case HandType.Tractor:
      return '拖拉机'
    case HandType.Throw:
      if (!isLead) return shape.pairs ? `多张 · ${shape.pairs} 对` : '多张'
      return shape.pairs ? `甩牌 · ${shape.pairs} 对` : '甩牌'
    default:
      return String(shape.type)
  }
}

export default function PlayLogDialog({
  open,
  mode,
  record,
  serialize,
  onExport,
  onClose,
}: PlayLogDialogProps) {
  const [format, setFormat] = useState<'json' | 'jsonc'>('json')
  /** 墩的显示顺序：默认倒序（最新一墩在最上面） */
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const fullText = useMemo(
    () => (mode === 'full' && open ? serialize(format) : ''),
    [mode, open, format, serialize, record],
  )

  if (!open) return null

  const hasPlays = record !== null
    && record.tricks.some(trick => trick.plays.length > 0)

  // 只反转「墩」的顺序；墩内仍按出牌顺序（领出 → 跟出）
  const trickItems = (record?.tricks ?? []).map((trick, index) => ({ trick, index }))
  if (order === 'desc') trickItems.reverse()

  return (
    <div style={OVERLAY_STYLE} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'full' ? '本局完整日志' : '本局出牌记录'}
        onClick={event => event.stopPropagation()}
        style={PANEL_STYLE}
      >
        <div style={HEADER_STYLE}>
          <div style={TITLE_STYLE}>
            {mode === 'full' ? '📄 本局完整日志' : '📜 本局出牌记录'}
          </div>
          {record && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              共 {record.tricks.length} 墩
            </span>
          )}
          <button onClick={onClose} style={CLOSE_STYLE} aria-label="关闭">
            ✕
          </button>
        </div>

        {mode === 'plays' ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflow: 'auto',
            minHeight: 0,
            paddingRight: 4,
          }}>
            {!hasPlays && (
              <div style={{
                padding: '28px 0',
                textAlign: 'center',
                fontSize: 14,
                color: 'rgba(255,255,255,0.5)',
              }}>
                本局还没有出牌记录
              </div>
            )}

            {trickItems.map(({ trick, index }) => (
              <div
                key={index}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  fontSize: 13,
                }}>
                  <b style={{ color: '#ffd700' }}>第 {index + 1} 墩</b>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                    领出 {POSITION_NAME_ZH[trick.leadPlayer]}家
                  </span>
                  {trick.winner && (
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                      · 赢家 {POSITION_NAME_ZH[trick.winner]}家
                    </span>
                  )}
                  {trick.points !== undefined && (
                    <span style={{ color: '#7ee787' }}>
                      · {trick.points} 分
                    </span>
                  )}
                  {trick.scoreAfter && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.45)',
                    }}>
                      闲 {trick.scoreAfter.defending} / 庄 {trick.scoreAfter.banker}
                    </span>
                  )}
                </div>

                {trick.plays.map((play, playIndex) => (
                  <div
                    key={playIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 6,
                      minHeight: 52,
                    }}
                  >
                    <span style={{
                      width: 34,
                      flexShrink: 0,
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.65)',
                    }}>
                      {POSITION_NAME_ZH[play.player]}家
                    </span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {play.cards.map(id => (
                        <CardComponent
                          key={id}
                          card={decodeCardId(id)}
                          faceUp
                          small
                          scale={0.52}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                      {shapeLabel(play.shape, playIndex === 0)}
                    </span>
                    {play.shape.points !== undefined && (
                      <span style={{ fontSize: 12, color: '#ffd700' }}>
                        +{play.shape.points}
                      </span>
                    )}
                    {play.throw && (
                      <span style={{ fontSize: 12, color: '#ff8a80' }}>
                        甩牌被拦 · 欲甩 {play.throw.attempted.length} 张
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <pre style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            margin: 0,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#d7e6d7',
            fontSize: 12,
            lineHeight: 1.55,
            fontFamily: "'Cascadia Code', Consolas, monospace",
            whiteSpace: 'pre',
          }}>
            {fullText}
          </pre>
        )}

        <div style={FOOTER_STYLE}>
          {mode === 'full' && (
            <>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['json', 'jsonc'] as const).map(value => (
                  <button
                    key={value}
                    onClick={() => setFormat(value)}
                    style={{
                      ...BUTTON_STYLE,
                      padding: '5px 12px',
                      fontSize: 12,
                      background: format === value
                        ? 'rgba(255,215,0,0.18)'
                        : 'rgba(255,255,255,0.06)',
                      color: format === value ? '#ffd700' : 'rgba(255,255,255,0.7)',
                      borderColor: format === value
                        ? 'rgba(255,215,0,0.55)'
                        : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => onExport(format)}
                style={PRIMARY_BUTTON_STYLE}
              >
                ⬇ 导出 {format.toUpperCase()}
              </button>
            </>
          )}
          {mode === 'plays' && (
            <>
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  ['desc', '倒序'],
                  ['asc', '正序'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setOrder(value)}
                    title={value === 'desc' ? '最新一墩在前' : '最早一墩在前'}
                    style={{
                      ...BUTTON_STYLE,
                      padding: '5px 12px',
                      fontSize: 12,
                      background: order === value
                        ? 'rgba(255,215,0,0.18)'
                        : 'rgba(255,255,255,0.06)',
                      color: order === value ? '#ffd700' : 'rgba(255,255,255,0.7)',
                      borderColor: order === value
                        ? 'rgba(255,215,0,0.55)'
                        : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span style={{ flex: 1 }} />
            </>
          )}
          <button onClick={onClose} style={BUTTON_STYLE}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
