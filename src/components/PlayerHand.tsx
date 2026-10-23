// ============================================================
// 南家手牌（升级分组展示，可点击选中）
// 样式：src/styles/components/_player-hand.scss（BEM）
// ============================================================

import { useMemo } from 'react';
import { type CardGroup } from '../core/card.ts';
import { type HandMark, handMarks } from '../core/hand.ts';
import { type Rank, type Suit } from '../core/types.ts';
import { cssVars } from '../utils/cssVars.ts';
import CardComponent from './CardComponent.tsx';

interface PlayerHandProps {
  groups: CardGroup[];
  /** 主花色（null = 无主 / 尚未定主） */
  trumpSuit: Suit | null;
  /** 当前级牌 */
  levelRank: Rank;
  /** 选中项（只读展示时可省略） */
  selectedIndices?: Set<number>;
  /** 点击选牌（只读展示时可省略） */
  onToggleCard?: (index: number) => void;
  /** 当前埋底阶段标记为从原底牌拿起的牌 */
  sourceCardIds?: Set<string>;
}

/** 手牌重叠偏移量（与 `.player-hand__card` 的 left 步长一致） */
const OVERLAP = 34;
/** 手牌缩放后单牌宽度 */
const CARD_W_SMALL = 71 * 0.95;

/** 花色颜色映射 — 与卡牌一致 */
const SUIT_COLORS: Record<string, string> = {
  S: '#111111',   // 黑桃
  H: '#c62828',   // 红心
  C: '#1b5e20',   // 梅花
  D: '#e65100',   // 方块
  trump: '#ffd700',
};

export default function PlayerHand({
  groups,
  trumpSuit,
  levelRank,
  selectedIndices,
  onToggleCard,
  sourceCardIds,
}: PlayerHandProps) {
  /** 对子 / 拖拉机标记（按牌的 id） */
  const marks = useMemo(
    () => handMarks(groups.flatMap(g => g.cards), trumpSuit, levelRank),
    [groups, trumpSuit, levelRank],
  );

  if (groups.length === 0) {
    return (
      <div className="player-hand player-hand--empty">
        无手牌
      </div>
    );
  }

  let globalIdx = 0;

  return (
    <div className="player-hand">
      {groups.map((group) => {
        const groupStartIdx = globalIdx;
        globalIdx += group.cards.length;
        return (
          <GroupSection
            key={String(group.kind)}
            group={group}
            groupStartIdx={groupStartIdx}
            marks={marks}
            selectedIndices={selectedIndices}
            onToggleCard={onToggleCard}
            sourceCardIds={sourceCardIds}
          />
        );
      })}
    </div>
  );
}

function GroupSection({
  group,
  groupStartIdx,
  marks,
  selectedIndices,
  onToggleCard,
  sourceCardIds,
}: {
  group: CardGroup;
  groupStartIdx: number;
  marks: Map<string, HandMark>;
  selectedIndices?: Set<number>;
  onToggleCard?: (index: number) => void;
  sourceCardIds?: Set<string>;
}) {
  const count = group.cards.length;
  const width = (count - 1) * OVERLAP + CARD_W_SMALL;
  const color = SUIT_COLORS[group.kind] ?? 'rgba(255,255,255,0.6)';

  return (
    <div className="player-hand__group">
      {/* 组标签：彩色图标 + 张数 */}
      <div
        className={group.kind === 'trump'
          ? 'player-hand__group-label player-hand__group-label--trump'
          : 'player-hand__group-label'}
        style={cssVars({ '--group-color': color })}
      >
        <span>{group.label}</span>
        <span className="player-hand__group-count">
          {count}
        </span>
      </div>

      {/* 牌 */}
      <div
        className="player-hand__cards"
        style={cssVars({ '--cards-width': `${width}px` })}
      >
        {group.cards.map((card, idx) => {
          const globalIdx = groupStartIdx + idx;
          const isSelected = selectedIndices?.has(globalIdx) ?? false;
          const mark = marks.get(card.id);
          return (
            <div
              key={card.id}
              className="player-hand__card"
              style={cssVars({ '--card-index': idx })}
            >
              <CardComponent
                card={card}
                faceUp={true}
                small={true}
                badge={sourceCardIds?.has(card.id) ? '底' : undefined}
                mark={mark
                  ? {
                      text: mark.kind === 'tractor' ? '拖' : '对',
                      color: mark.kind === 'tractor' ? '#ef6c00' : '#2e7d32',
                    }
                  : undefined}
                selected={isSelected}
                onClick={onToggleCard
                  ? () => onToggleCard(globalIdx)
                  : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
