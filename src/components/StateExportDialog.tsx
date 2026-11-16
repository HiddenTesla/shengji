import { useEffect, useState } from 'react';

interface StateExportDialogProps {
  open: boolean;
  serialize: (format: 'json' | 'jsonc') => string;
  onExport: (format: 'json' | 'jsonc') => void;
  onClose: () => void;
}

function chipClass(active: boolean): string {
  return active ? 'log-panel__chip log-panel__chip--active' : 'log-panel__chip';
}

export default function StateExportDialog({
  open,
  serialize,
  onExport,
  onClose,
}: StateExportDialogProps) {
  const [format, setFormat] = useState<'json' | 'jsonc'>('json');
  const [copyStatus, setCopyStatus] = useState('');
  const text = open ? serialize(format) : '';

  useEffect(() => {
    if (!open) return;
    setFormat('json');
    setCopyStatus('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  async function copyState() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
    catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        copied = document.execCommand('copy');
      }
      catch {
        copied = false;
      }
      finally {
        area.remove();
      }
    }
    setCopyStatus(copied ? '✅ 已复制' : '复制失败，请手动选择文本复制');
    window.setTimeout(() => setCopyStatus(''), 2000);
  }

  if (!open) return null;

  return (
    <div className="log-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="导出当前局面"
        onClick={event => event.stopPropagation()}
        className="log-panel"
      >
        <div className="log-panel__header">
          <div className="log-panel__title">导出当前局面</div>
          <button className="log-panel__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <pre className="log-text">{text}</pre>

        <div className="log-panel__footer">
          <div className="log-panel__chip-group">
            {([
              ['json', 'JSON'],
              ['jsonc', 'JSONC'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setFormat(value);
                  setCopyStatus('');
                }}
                className={chipClass(format === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="log-panel__spacer" />
          {copyStatus && <span className="log-panel__count">{copyStatus}</span>}
          <button onClick={copyState} className="log-panel__button">
            📋 复制到剪贴板
          </button>
          <button
            onClick={() => onExport(format)}
            className="log-panel__button log-panel__button--primary"
          >
            ⬇ 导出 {format.toUpperCase()}
          </button>
          <button onClick={onClose} className="log-panel__button">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
