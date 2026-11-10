// ============================================================
// 底牌查看 —— 以弹窗（modal）的形式查看埋入的 8 张底牌
// 桌中央留给出牌区，底牌不再常驻显示
// 仅当南家为庄（canReveal）时可查看
// ============================================================

import { useState, useEffect } from 'react';
import {
  type Card,
  pointValue,
} from '../core/types.ts';
import CardComponent from './CardComponent.tsx';

interface BottomRevealProps {
  /** 底牌（8 张） */
  cards: Card[];
  /** 是否允许查看（南家为庄） */
  canReveal: boolean;
}

export default function BottomReveal({ cards, canReveal }: BottomRevealProps) {
  const [open, setOpen] = useState(false);
  const canShow = canReveal && cards.length > 0;

  // Esc 关闭弹窗
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 变得不可查看时（换局 / 庄家不是南家）自动关掉弹窗
  useEffect(() => {
    if (!canShow) setOpen(false);
  }, [canShow]);

  const points = cards.reduce((sum, c) => sum + pointValue(c.rank), 0);

  return (
    <>
      {/* 触发按钮：不可查看时也保留位置（隐藏），避免操作行里的其它按钮跟着移动 */}
      <button
        className={canShow
          ? 'bottom-reveal__trigger'
          : 'bottom-reveal__trigger bottom-reveal__trigger--hidden'}
        onClick={() => setOpen(true)}
        title="查看埋入的底牌"
        disabled={!canShow}
        aria-hidden={!canShow}
        tabIndex={canShow ? 0 : -1}
      >
        🂠 查看底牌
      </button>

      {/* 弹窗 */}
      {canShow && open && (
        <div
          className="bottom-reveal-overlay"
          onClick={() => setOpen(false)}
        >
          <div
            className="bottom-reveal"
            onClick={e => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="bottom-reveal__header">
              <span className="bottom-reveal__title">
                🂠 底牌 · {cards.length} 张
              </span>
              <span className="bottom-reveal__points">
                底分 {points}
              </span>
              <span className="bottom-reveal__spacer" />
              <button
                className="bottom-reveal__close"
                onClick={() => setOpen(false)}
              >
                关闭
              </button>
            </div>

            {/* 底牌牌面 */}
            <div className="bottom-reveal__cards">
              {cards.map(c => (
                <CardComponent key={c.id} card={c} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
