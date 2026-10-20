// ============================================================
// 通用确认对话框（模态）
// ============================================================

import { useEffect, type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** 说明文字（可多行） */
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 确认按钮是否为危险操作（红色） */
  danger?: boolean
  /** 附加内容（如规则选项），渲染在说明文字与按钮之间 */
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Enter') onConfirm()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={event => event.stopPropagation()}
        style={{
          width: 360,
          maxWidth: 'calc(100vw - 40px)',
          padding: '20px 22px 16px',
          borderRadius: 12,
          background: '#1e2b1e',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          color: 'rgba(255,255,255,0.88)',
        }}
      >
        <div style={{
          fontSize: 19,
          fontWeight: 700,
          marginBottom: 10,
          color: '#fff',
        }}>
          {title}
        </div>

        {description && (
          <div style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.65)',
            whiteSpace: 'pre-line',
          }}>
            {description}
          </div>
        )}

        {children && (
          <div style={{ marginTop: 16 }}>
            {children}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          marginTop: 20,
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 6,
              background: danger
                ? 'linear-gradient(135deg, #e53935, #c62828)'
                : 'linear-gradient(135deg, #ffd700, #ffb300)',
              color: danger ? '#fff' : '#1a1a1a',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
