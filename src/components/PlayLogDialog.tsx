// ============================================================
// 出牌记录弹窗
//
//   mode="plays"：「查看 → 出牌记录」，默认显示本局的出牌（不含发牌 / 底牌），
//                 也可切换到 JSON / JSONC 文本视图（可选中、可复制 / 导出）
//   mode="full" ：本局结算时显示完整日志，并可复制 / 导出 JSON / JSONC
// 样式：src/styles/components/_play-log-dialog.scss（BEM）
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  type PlayRecord,
  type RoundRecord,
  decodeCardId,
} from '../core/playlog.ts';
import {
  HandType,
  POSITION_NAME_ZH,
} from '../core/types.ts';
import CardComponent from './CardComponent.tsx';

interface PlayLogDialogProps {
  open: boolean;
  mode: 'plays' | 'full';
  record: RoundRecord | null;
  /** 生成完整日志文本（默认 JSON） */
  serialize: (format: 'json' | 'jsonc') => string;
  onExport: (format: 'json' | 'jsonc') => void;
  onClose: () => void;
}

/** 小号切换按钮（倒序/正序、JSON/JSONC 等）的类名 */
function chipClass(active: boolean): string {
  return active ? 'log-panel__chip log-panel__chip--active' : 'log-panel__chip';
}

function shapeLabel(shape: PlayRecord['shape'], isLead: boolean): string {
  switch (shape.type) {
    case HandType.Single:
      return '单张';
    case HandType.Pair:
      return '对子';
    case HandType.Tractor:
      return '拖拉机';
    case HandType.Throw:
      if (!isLead) return shape.pairs ? `多张 · ${shape.pairs} 对` : '多张';
      return shape.pairs ? `甩牌 · ${shape.pairs} 对` : '甩牌';
    default:
      return String(shape.type);
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
  const [format, setFormat] = useState<'json' | 'jsonc'>('json');
  /** 墩的显示顺序：默认倒序（最新一墩在最上面） */
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  /** plays 模式：是否切换到 JSON / JSONC 文本视图 */
  const [showJson, setShowJson] = useState(false);
  /** 复制成功提示（短暂显示「已复制」） */
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // 每次打开都回到默认视图：对局中 = 图形记录，结算 = JSON 文本
  useEffect(() => {
    if (!open) return;
    setShowJson(mode === 'full');
    setCopied(false);
  }, [open, mode]);

  useEffect(() => {
    setCopied(false);
  }, [format, showJson]);

  /** 是否显示 JSON / JSONC 文本视图（两种模式都可自由切换） */
  const showingJson = showJson;

  const fullText = useMemo(
    () => (showingJson && open ? serialize(format) : ''),
    // serialize 每次渲染都是新函数（依赖 logRef），保留 record 作为刷新信号
    [showingJson, open, format, serialize, record],
  );

  /** 复制当前文本到剪贴板（非安全上下文时回退 execCommand） */
  async function copyLog() {
    const text = fullText;
    if (!text) return;
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    }
    catch {
      // 权限被拒 / 非安全上下文：走下面的回退
    }
    if (!done) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      }
      finally {
        area.remove();
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!open) return null;

  const hasPlays = record !== null
    && record.tricks.some(trick => trick.plays.length > 0);

  // 只反转「墩」的顺序；墩内仍按出牌顺序（领出 → 跟出）
  const trickItems = (record?.tricks ?? []).map((trick, index) => ({ trick, index }));
  if (order === 'desc') trickItems.reverse();

  return (
    <div className="log-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'full' ? '本局完整日志' : '本局出牌记录'}
        onClick={event => event.stopPropagation()}
        className="log-panel"
      >
        <div className="log-panel__header">
          <div className="log-panel__title">
            {mode === 'full' ? '📄 本局完整日志' : '📜 本局出牌记录'}
          </div>
          {record && (
            <span className="log-panel__count">
              共 {record.tricks.length} 墩
            </span>
          )}
          <button className="log-panel__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {!showingJson ? (
          <div className="log-list">
            {!hasPlays && (
              <div className="log-list__empty">
                本局还没有出牌记录
              </div>
            )}

            {trickItems.map(({ trick, index }) => (
              <div
                key={index}
                className="log-trick"
              >
                <div className="log-trick__header">
                  <b className="log-trick__no">第 {index + 1} 墩</b>
                  <span className="log-trick__meta">
                    领出 {POSITION_NAME_ZH[trick.leadPlayer]}家
                  </span>
                  {trick.winner && (
                    <span className="log-trick__meta">
                      · 赢家 {POSITION_NAME_ZH[trick.winner]}家
                    </span>
                  )}
                  {trick.points !== undefined && (
                    <span className="log-trick__points">
                      · {trick.points} 分
                    </span>
                  )}
                  {trick.scoreAfter && (
                    <span className="log-trick__score">
                      闲 {trick.scoreAfter.defending} / 庄 {trick.scoreAfter.banker}
                    </span>
                  )}
                </div>

                {trick.plays.map((play, playIndex) => (
                  <div
                    key={playIndex}
                    className="log-play"
                  >
                    <span className="log-play__player">
                      {POSITION_NAME_ZH[play.player]}家
                    </span>
                    <div className="log-play__cards">
                      {play.cards.map(id => (
                        <CardComponent
                          key={id}
                          card={decodeCardId(id)}
                          faceUp={true}
                          small={true}
                          scale={0.52}
                        />
                      ))}
                    </div>
                    <span className="log-play__shape">
                      {shapeLabel(play.shape, playIndex === 0)}
                    </span>
                    {play.shape.points !== undefined && (
                      <span className="log-play__points">
                        +{play.shape.points}
                      </span>
                    )}
                    {play.throw && (
                      <span className="log-play__throw">
                        甩牌被拦 · 欲甩 {play.throw.attempted.length} 张
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <pre className="log-text">
            {fullText}
          </pre>
        )}

        <div className="log-panel__footer">
          {/* 记录视图：墩的排序 */}
          {!showingJson && (
            <div className="log-panel__chip-group">
              {([
                ['desc', '倒序'],
                ['asc', '正序'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setOrder(value)}
                  title={value === 'desc' ? '最新一墩在前' : '最早一墩在前'}
                  className={chipClass(order === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 图形记录 / JSON / JSONC 视图切换（对局中与结算均可用） */}
          <div className="log-panel__chip-group">
            {([
              ['log', '📜 记录'],
              ['json', 'JSON'],
              ['jsonc', 'JSONC'],
            ] as const).map(([value, label]) => {
              const active = value === 'log'
                ? !showJson
                : showJson && format === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    if (value === 'log') {
                      setShowJson(false);
                    }
                    else {
                      setShowJson(true);
                      setFormat(value);
                    }
                  }}
                  title={value === 'log'
                    ? '图形化显示每墩出牌'
                    : `显示 ${value.toUpperCase()} 文本`}
                  className={chipClass(active)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span className="log-panel__spacer" />

          {showingJson && (
            <button
              onClick={copyLog}
              className="log-panel__button"
              title="复制当前文本到剪贴板"
            >
              {copied ? '✅ 已复制' : '📋 复制'}
            </button>
          )}
          {showingJson && (
            <button
              onClick={() => onExport(format)}
              className="log-panel__button log-panel__button--primary"
            >
              ⬇ 导出 {format.toUpperCase()}
            </button>
          )}
          <button onClick={onClose} className="log-panel__button">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
