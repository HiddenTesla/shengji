// ============================================================
// 通用确认对话框（模态）
// ============================================================

import { useEffect, type ReactNode } from 'react';
import { cssVars } from '../utils/cssVars.ts';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 说明文字（可多行） */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 隐藏取消按钮（只读信息框：只有一个「知道了」） */
  hideCancel?: boolean;
  /** 对话框宽度（默认 360） */
  width?: number;
  /** 确认按钮是否为危险操作（红色） */
  danger?: boolean;
  /** 附加内容（如规则选项），渲染在说明文字与按钮之间 */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  hideCancel = false,
  width = 360,
  danger = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={event => event.stopPropagation()}
        className="dialog"
        style={cssVars({ '--dialog-width': `${width}px` })}
      >
        <div className="dialog__title">
          {title}
        </div>

        {description && (
          <div className="dialog__desc">
            {description}
          </div>
        )}

        {children && (
          <div className="dialog__content">
            {children}
          </div>
        )}

        <div className="dialog__footer">
          {!hideCancel && (
            <button
              className="dialog__button"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button
            className={danger
              ? 'dialog__button dialog__button--confirm dialog__button--danger'
              : 'dialog__button dialog__button--confirm'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
