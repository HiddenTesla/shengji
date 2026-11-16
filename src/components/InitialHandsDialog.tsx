// ============================================================
// 四家初始手牌（本局结算里查看）
//
//   「埋底前」= 发牌时的 25 张；庄家再把 8 张底牌拿在手里（25 → 33），
//              这 8 张带金色描边 + 「底」标记，方便复盘时看出哪几张是捞底的。
//   「埋底后」= 四家各 25 张（开始出牌时的手牌）。
// 样式：src/styles/components/_initial-hands-dialog.scss（BEM）
// ============================================================

import { useMemo, useState } from 'react';
import { groupCardsForDisplay } from '../core/card.ts';
import { type Hands } from '../core/play.ts';
import {
  ALL_POSITIONS,
  type Card,
  POSITION_NAME_ZH,
  type PlayerPosition,
  type Rank,
  Suit,
  SUIT_SYMBOL,
} from '../core/types.ts';
import { cssVars } from '../utils/cssVars.ts';
import CardComponent from './CardComponent.tsx';
import ConfirmDialog from './ConfirmDialog.tsx';

interface InitialHandsDialogProps {
  open: boolean;
  /** 发牌时的四家手牌（每家 25 张）；null = 没有发牌记录（如导入的局面） */
  hands: Hands | null;
  /** 埋底前的 8 张底牌（庄家从底牌拿到的牌） */
  bottomCards: Card[];
  /** 庄家实际埋掉的 8 张牌（「埋底后」= 33 张减去这 8 张）；缺省按「没有埋底记录」处理 */
  buriedCards?: Card[];
  /** 本局庄家（埋底前多拿 8 张的那一家） */
  banker: PlayerPosition | null;
  /** 本局主牌花色（null = 无主） */
  trumpSuit: Suit | null;
  /** 本局级牌 */
  levelRank: Rank;
  onClose: () => void;
}

/** 深色弹窗里的门标签颜色 */
const GROUP_TEXT_COLOR: Record<Suit | 'trump', string> = {
  [Suit.Spade]: '#f2f2f2',
  [Suit.Heart]: '#ff6b6b',
  [Suit.Club]: '#7bd88f',
  [Suit.Diamond]: '#ffb74d',
  [Suit.Joker]: '#d0a0ff',
  trump: '#ffd700',
};

export default function InitialHandsDialog({
  open,
  hands,
  bottomCards,
  buriedCards = [],
  banker,
  trumpSuit,
  levelRank,
  onClose,
}: InitialHandsDialogProps) {
  /** true = 埋底前（庄家 25 + 底牌 8 = 33 张）；false = 埋底后（庄家埋掉 8 张后的 25 张） */
  const [beforeBury, setBeforeBury] = useState(true);

  const bottomIds = useMemo(
    () => new Set(bottomCards.map(card => card.id)),
    [bottomCards],
  );
  const buriedIds = useMemo(
    () => new Set(buriedCards.map(card => card.id)),
    [buriedCards],
  );
  /** 有底牌记录才谈得上「埋底前」 */
  const hasBottom = bottomCards.length > 0 && banker !== null;
  /** 有埋底记录才能算出「埋底后」 */
  const hasBury = hasBottom && buriedCards.length > 0;

  return (
    <ConfirmDialog
      open={open}
      title="四家初始手牌"
      description={hands
        ? undefined
        : '导入的局面没有发牌记录，无法显示四家初始手牌。'}
      width={1200}
      confirmLabel="关闭"
      hideCancel={true}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <div className="initial-hands">
        {/* 埋底前 / 埋底后 */}
        <div className="initial-hands__bar">
          <span className="initial-hands__bar-label">手牌</span>
          <button
            type="button"
            className={beforeBury
              ? 'initial-hands__toggle initial-hands__toggle--active'
              : 'initial-hands__toggle'}
            disabled={!hasBottom}
            title={hasBottom ? '庄家已拿起 8 张底牌（25 → 33）' : '没有底牌记录'}
            onClick={() => setBeforeBury(true)}
          >
            埋底前
          </button>
          <button
            type="button"
            className={beforeBury
              ? 'initial-hands__toggle'
              : 'initial-hands__toggle initial-hands__toggle--active'}
            disabled={!hasBury}
            title={hasBury
              ? `庄家埋掉 ${buriedCards.length} 张底牌后剩下的手牌`
              : '没有埋底记录'}
            onClick={() => setBeforeBury(false)}
          >
            埋底后
          </button>
          <span className="initial-hands__hint">
            {beforeBury && hasBottom
              ? `庄家 ${(hands?.[banker]?.length ?? 0) + bottomCards.length} 张 · 金边「底」= 从底牌拿到的 ${bottomCards.length} 张`
              : hasBury
                ? `庄家埋掉 ${buriedCards.length} 张 · 金边「底」= 手里还留着的底牌`
                : '发牌后四家各 25 张'}
          </span>
        </div>

        {ALL_POSITIONS.map(position => {
          const base = hands?.[position] ?? [];
          // 庄家：发牌的 25 张 + 拿起的 8 张底牌（埋底前共 33 张）
          const isBanker = hasBottom && position === banker;
          const beforeCards = isBanker ? [...base, ...bottomCards] : base;
          // 埋底后：庄家把埋掉的 8 张拿掉，剩下 25 张
          const afterCards = isBanker
            ? beforeCards.filter(card => !buriedIds.has(card.id))
            : base;
          const cards = beforeBury ? beforeCards : afterCards;
          return (
            <div
              key={position}
              className={position === banker
                ? 'initial-hands__row initial-hands__row--banker'
                : 'initial-hands__row'}
            >
              <div className="initial-hands__who">
                <span className={position === banker
                  ? 'initial-hands__seat initial-hands__seat--banker'
                  : 'initial-hands__seat'}
                >
                  {POSITION_NAME_ZH[position]}家
                </span>
                <span className="initial-hands__count">
                  {cards.length} 张
                  {isBanker
                    ? beforeBury
                      ? `（含底 ${bottomCards.length}）`
                      : `（已埋 ${buriedCards.length}）`
                    : ''}
                </span>
              </div>

              <div className="initial-hands__groups">
                {groupCardsForDisplay(cards, trumpSuit, levelRank).map(group => (
                  <div key={String(group.kind)} className="initial-hands__group">
                    {/* 门标签 + 该门张数（张数在花色下方） */}
                    <div
                      className="initial-hands__group-info"
                      style={cssVars({ '--suit-color': GROUP_TEXT_COLOR[group.kind] })}
                    >
                      <span className="initial-hands__group-label">
                        {group.kind === 'trump' ? '主牌' : SUIT_SYMBOL[group.kind]}
                      </span>
                      <span className="initial-hands__group-count">
                        {group.cards.length}
                      </span>
                    </div>
                    <div className="initial-hands__cards">
                      {group.cards.map(card => {
                        // 从底牌拿到的牌（两种视图都标：埋底后剩下的底牌同样高亮）
                        const fromBottom = isBanker && bottomIds.has(card.id);
                        return (
                          <div
                            key={card.id}
                            className={fromBottom
                              ? 'initial-hands__card initial-hands__card--bottom'
                              : 'initial-hands__card'}
                          >
                            <CardComponent
                              card={card}
                              faceUp={true}
                              small={true}
                              scale={0.52}
                              badge={fromBottom ? '底' : undefined}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ConfirmDialog>
  );
}
