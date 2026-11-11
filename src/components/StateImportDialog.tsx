import { useEffect, useState } from 'react';
import { type ParsedGameState, parseGameState } from '../core/state.ts';

interface StateImportDialogProps {
  open: boolean;
  onImportReady: (state: ParsedGameState) => void;
  onClose: () => void;
}

export default function StateImportDialog({
  open,
  onImportReady,
  onClose,
}: StateImportDialogProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function validateAndContinue() {
    try {
      onImportReady(parseGameState(text));
      setError('');
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!open) return null;

  return (
    <div className="log-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="导入局面"
        onClick={event => event.stopPropagation()}
        className="log-panel"
      >
        <div className="log-panel__header">
          <div className="log-panel__title">导入局面</div>
          <button className="log-panel__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="state-import__hint">
          粘贴出牌阶段导出的 JSON 或 JSONC 局面。按「确定」后还会再次确认，当前对局不会提前改变。
        </div>
        <textarea
          aria-label="局面 JSON 或 JSONC"
          className="log-text state-import__text"
          spellCheck={false}
          value={text}
          onChange={event => {
            setText(event.target.value);
            setError('');
          }}
          placeholder="在此粘贴局面 JSON/JSONC…"
        />
        {error && (
          <div role="alert" className="state-import__error">
            {error}
          </div>
        )}

        <div className="log-panel__footer">
          <span className="log-panel__spacer" />
          <button onClick={onClose} className="log-panel__button">
            取消
          </button>
          <button
            onClick={validateAndContinue}
            className="log-panel__button log-panel__button--primary"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
