// ============================================================
// 东/西/北家手牌（支持显示/隐藏切换）
//
// 翻开时：
//   - 北家与南家一致 —— 按「门」横向分组显示（主牌 / ♠ / ♥ / ♣ / ♦）
//   - 东/西家按「门」分为若干竖列，同一门内竖排，逐张可见点数与花色
// 样式：src/styles/components/_opponent-hand.scss（BEM）
// ============================================================

import { useMemo } from 'react';
import {
  type Card,
  type PlayerPosition,
  type Rank,
  type Suit,
  type PlayerMode,
  POSITION_NAME_ZH,
} from '../core/types.ts';
import { type CardGroup, groupCardsForDisplay } from '../core/card.ts';
import { type HandMark, handMarks } from '../core/hand.ts';
import { cssVars } from '../utils/cssVars.ts';
import CardComponent from './CardComponent.tsx';
import PlayerHand from './PlayerHand.tsx';
import PlayerModeButton from './PlayerModeButton.tsx';

interface OpponentHandProps {
  position: PlayerPosition;
  /** 该家手牌 */
  cards: Card[];
  /** 当前级牌 */
  levelRank: Rank;
  /** 主花色（null = 无主 / 尚未定主） */
  trumpSuit: Suit | null;
  faceUp: boolean;
  showToggle?: boolean;
  onToggleVisibility?: () => void;
  playerMode: PlayerMode;
  onToggleMode: () => void;
  selectedIndices?: Set<number>;
  onToggleCard?: (index: number) => void;
  sourceCardIds?: Set<string>;
}

/** 牌背重叠偏移 */
const OVERLAP_H = 26; // 水平（北/南）
const OVERLAP_V = 22; // 垂直（东/西）
const CARD_W = 71 * 0.95;
const CARD_H = 96 * 0.95;

/** 东/西家翻开时：同一门内竖排的步长（保证点数与花色可见） */
const SIDE_STEP_Y = 42;
/**
 * 东/西家翻开时：每列最多张数，超出则同一门拆成多列。
 * 取 6 使翻开后的竖列不高于牌背竖排，避免挤占南家手牌空间。
 */
const SIDE_ROWS_PER_COL = 6;

/** 门标签颜色 */
const GROUP_COLORS: Record<string, string> = {
  S: '#111111',
  H: '#c62828',
  C: '#1b5e20',
  D: '#e65100',
  trump: '#ffd700',
};

export default function OpponentHand({
  position,
  cards,
  levelRank,
  trumpSuit,
  faceUp,
  showToggle,
  onToggleVisibility,
  playerMode,
  onToggleMode,
  selectedIndices,
  onToggleCard,
  sourceCardIds,
}: OpponentHandProps) {
  const label = POSITION_NAME_ZH[position];
  const isSide = position === 'E' || position === 'W';
  const cardCount = cards.length;
  const maxShow = Math.min(cardCount, 12);
  const groups = groupCardsForDisplay(cards, trumpSuit, levelRank);
  const isSelectable = onToggleCard !== undefined;
  const showCardsFaceUp = faceUp || isSelectable;
  /** 对子 / 拖拉机标记（东/西竖排与北家横排共用） */
  const marks = useMemo(
    () => handMarks(cards, trumpSuit, levelRank),
    [cards, trumpSuit, levelRank],
  );

  if (cardCount === 0) {
    return (
      <div className="opponent-hand">
        <LabelRow
          position={position}
          faceUp={faceUp}
          showToggle={showToggle}
          onToggleVisibility={onToggleVisibility}
          playerMode={playerMode}
          onToggleMode={onToggleMode}
        />
        <div className="opponent-hand__empty">
          无手牌
        </div>
      </div>
    );
  }

  // ---- 横排（北家） ----
  if (!isSide) {
    const width = maxShow * OVERLAP_H + CARD_W;
    return (
      <div className="opponent-hand">
        <LabelRow
          position={position}
          faceUp={showCardsFaceUp}
          showToggle={showToggle && !isSelectable}
          onToggleVisibility={onToggleVisibility}
          playerMode={playerMode}
          onToggleMode={onToggleMode}
        />
        {/* 固定高度：显示/隐藏切换时按钮位置不变 */}
        <div className="opponent-hand__top-area">
          {showCardsFaceUp ? (
            <PlayerHand
              groups={groups}
              trumpSuit={trumpSuit}
              levelRank={levelRank}
              selectedIndices={selectedIndices}
              onToggleCard={onToggleCard}
              sourceCardIds={sourceCardIds}
            />
          ) : (
            <div
              className="opponent-hand__back-stack"
              style={cssVars({ '--stack-width': `${width}px` })}
            >
              {Array.from({ length: maxShow }).map((_, idx) => (
                <div
                  key={idx}
                  className="opponent-hand__back-card"
                  style={cssVars({ '--card-index': idx })}
                >
                  <CardComponent
                    card={{ id: `h-${idx}`, suit: 'S' as any, rank: 2 as any }}
                    faceUp={false}
                    small={true}
                  />
                </div>
              ))}
              {cardCount > 12 && <ExtraBadge count={cardCount - 12} />}
            </div>
          )}
        </div>
        <CardCount count={cardCount} />
      </div>
    );
  }

  // ---- 竖排（东/西） ----
  const backHeight = maxShow * OVERLAP_V + CARD_H;
  const revealHeight =
    (Math.min(cardCount, SIDE_ROWS_PER_COL) - 1) * SIDE_STEP_Y + CARD_H;
  // 固定高度 + 以外缘为锚点：显示/隐藏切换时按钮位置不变
  const sideAreaHeight = isSelectable
    ? revealHeight
    : Math.max(backHeight, revealHeight);

  return (
    <div className={position === 'W'
      ? 'opponent-hand opponent-hand--start'
      : 'opponent-hand opponent-hand--end'}
    >
      <LabelRow
        position={position}
        faceUp={showCardsFaceUp}
        showToggle={showToggle && !isSelectable}
        onToggleVisibility={onToggleVisibility}
        playerMode={playerMode}
        onToggleMode={onToggleMode}
      />
      <div
        className="opponent-hand__side-area"
        style={cssVars({ '--side-area-height': `${sideAreaHeight}px` })}
      >
        {showCardsFaceUp ? (
          <SideGroupColumns
            groups={groups}
            marks={marks}
            selectedIndices={selectedIndices}
            onToggleCard={onToggleCard}
            sourceCardIds={sourceCardIds}
          />
        ) : (
          <div
            className="opponent-hand__back-stack opponent-hand__back-stack--vertical"
            style={cssVars({ '--stack-height': `${backHeight}px` })}
          >
            {Array.from({ length: maxShow }).map((_, idx) => (
              <div
                key={idx}
                className="opponent-hand__back-card opponent-hand__back-card--vertical"
                style={cssVars({ '--card-index': idx })}
              >
                <CardComponent
                  card={{ id: `v-${idx}`, suit: 'S' as any, rank: 2 as any }}
                  faceUp={false}
                  small={true}
                />
              </div>
            ))}
            {cardCount > 12 && <ExtraBadge count={cardCount - 12} side={true} />}
          </div>
        )}
      </div>
      <CardCount count={cardCount} />
    </div>
  );
}

// ---- 子组件 ----

/** 东/西家翻开：按「门」分列，同一门内竖排（必要时同门拆成多列） */
function SideGroupColumns({
  groups,
  marks,
  selectedIndices,
  onToggleCard,
  sourceCardIds,
}: {
  groups: CardGroup[];
  marks: Map<string, HandMark>;
  selectedIndices?: Set<number>;
  onToggleCard?: (index: number) => void;
  sourceCardIds?: Set<string>;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="side-columns">
      {groups.map((group, groupIndex) => {
        const groupStart = groups
          .slice(0, groupIndex)
          .reduce((count, previous) => count + previous.cards.length, 0);
        const n = group.cards.length;
        const colCount = Math.max(1, Math.ceil(n / SIDE_ROWS_PER_COL));
        const rows = Math.min(n, SIDE_ROWS_PER_COL);
        const height = (rows - 1) * SIDE_STEP_Y + CARD_H;

        return (
          <div
            key={String(group.kind)}
            className="side-columns__group"
          >
            <GroupLabel group={group} />

            <div className="side-columns__cols">
              {Array.from({ length: colCount }).map((_, ci) => (
                <div
                  key={ci}
                  className="side-columns__col"
                  style={cssVars({ '--col-height': `${height}px` })}
                >
                  {group.cards
                    .slice(ci * SIDE_ROWS_PER_COL, (ci + 1) * SIDE_ROWS_PER_COL)
                    .map((card, i) => {
                      const cardIndex = groupStart + ci * SIDE_ROWS_PER_COL + i;
                      const selected = selectedIndices?.has(cardIndex) ?? false;
                      const mark = marks.get(card.id);
                      return (
                        <div
                          key={card.id}
                          className="side-columns__card"
                          style={cssVars({ '--card-index': i })}
                        >
                          <CardComponent
                            card={card}
                            faceUp={true}
                            small={true}
                            inlineSuit={true}
                            badge={sourceCardIds?.has(card.id) ? '底' : undefined}
                            badgePosition="top-right"
                            mark={mark
                              ? {
                                  text: mark.kind === 'tractor' ? '拖' : '对',
                                  color: mark.kind === 'tractor' ? '#ef6c00' : '#2e7d32',
                                  position: 'top-right',
                                }
                              : undefined}
                            selected={selected}
                            onClick={onToggleCard
                              ? () => onToggleCard(cardIndex)
                              : undefined}
                          />
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 门标签：主牌 / ♠ 等 + 张数 */
function GroupLabel({ group }: { group: CardGroup }) {
  const color = GROUP_COLORS[group.kind] ?? 'rgba(255,255,255,0.7)';
  return (
    <div
      className="group-label"
      style={cssVars({ '--group-color': color })}
    >
      <span>{group.label}</span>
      <span className="group-label__count">
        {group.cards.length}
      </span>
    </div>
  );
}

function LabelRow({
  position,
  faceUp,
  showToggle,
  onToggleVisibility,
  playerMode,
  onToggleMode,
}: {
  position: PlayerPosition;
  faceUp: boolean;
  showToggle?: boolean;
  onToggleVisibility?: () => void;
  playerMode: PlayerMode;
  onToggleMode: () => void;
}) {
  return (
    <div className="label-row">
      <span className="label-row__name">
        {POSITION_NAME_ZH[position]}家
      </span>
      <PlayerModeButton
        position={position}
        mode={playerMode}
        onToggle={onToggleMode}
      />
      {showToggle && (
        <button
          className={faceUp
            ? 'label-row__toggle label-row__toggle--on'
            : 'label-row__toggle'}
          onClick={onToggleVisibility}
        >
          {faceUp ? '隐藏' : '显示'}
        </button>
      )}
    </div>
  );
}

function CardCount({ count }: { count: number }) {
  return (
    <div className="opponent-hand__count">
      {count} 张
    </div>
  );
}

function ExtraBadge({ count, side }: { count: number; side?: boolean }) {
  return (
    <div className={side ? 'extra-badge extra-badge--side' : 'extra-badge'}>
      +{count}
    </div>
  );
}
