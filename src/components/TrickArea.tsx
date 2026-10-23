// ============================================================
// 出牌区 —— 牌桌中央显示本墩四家的出牌
// 布局：北在上、南在下、西在左、东在右，中央为墩信息
// 样式：src/styles/components/_trick-area.scss（BEM）
// ============================================================

import { useState } from 'react';
import {
  type Card,
  PlayerPosition,
  POSITION_NAME_ZH,
  type Rank,
  type Suit,
} from '../core/types.ts';
import {
  type PlayState,
  currentTrickLeader,
  doorLabel,
} from '../core/play.ts';
import { trickPoints } from '../core/scoring.ts';
import { cssVars } from '../utils/cssVars.ts';
import CardComponent from './CardComponent.tsx';

interface TrickAreaProps {
  state: PlayState;
  trumpSuit: Suit | null;
  levelRank: Rank;
}

/** 出牌区用的牌缩放（比手牌更小） */
const CARD_SCALE = 0.62;
const CARD_W = 71 * CARD_SCALE;
const CARD_H = 96 * CARD_SCALE;
/** 一手多张牌时的重叠步长上限 */
const STEP_MAX = 26;
/** 每手牌区域宽度（多张牌在此宽度内压缩重叠） */
const SLOT_W = 168;

/** 四家在本墩中的方位 */
const SLOTS: { player: PlayerPosition; col: number; row: number }[] = [
  { player: PlayerPosition.North, col: 2, row: 1 },
  { player: PlayerPosition.West, col: 1, row: 2 },
  { player: PlayerPosition.East, col: 3, row: 2 },
  { player: PlayerPosition.South, col: 2, row: 3 },
];

/** 「轮到谁出牌」箭头：指向该玩家所在方位（牌未出，空位上显示） */
const TURN_ARROW: Record<PlayerPosition, string> = {
  [PlayerPosition.North]: '▲',
  [PlayerPosition.South]: '▼',
  [PlayerPosition.West]: '◀',
  [PlayerPosition.East]: '▶',
};

export default function TrickArea({ state, trumpSuit, levelRank }: TrickAreaProps) {
  const { trick } = state;
  const trickNo = state.tricks.length + 1;
  const leadLabel = trick.leadDoor ? doorLabel(trick.leadDoor) : null;
  const curPoints = trickPoints(trick.plays.flatMap(p => p.cards));
  const currentLeader = currentTrickLeader(trick, trumpSuit, levelRank);
  // 折叠框：记录「当前展开的是哪一墩」，换墩后自然回到收起
  const [openTrick, setOpenTrick] = useState<number | null>(null);

  return (
    <div className="trick-area">
      {SLOTS.map(slot => {
        const play = trick.plays.find(p => p.player === slot.player);
        const isLeadSlot = play && play.player === trick.leadPlayer;
        return (
          <div
            key={slot.player}
            className="trick-area__slot"
            style={cssVars({ '--slot-col': slot.col, '--slot-row': slot.row })}
          >
            <PlaySlot
              player={slot.player}
              cards={play?.cards ?? []}
              attempt={isLeadSlot ? trick.throwAttempt : []}
              attemptOpen={openTrick === trickNo}
              onToggleAttempt={() => setOpenTrick(openTrick === trickNo ? null : trickNo)}
              isCurrentMax={currentLeader === slot.player}
              isWinner={trick.complete && trick.winner === slot.player}
              isLead={trick.leadPlayer === slot.player}
              isTurn={!trick.complete && state.turn === slot.player}
            />
          </div>
        );
      })}

      {/* 中央：墩信息 */}
      <div className="trick-area__center">
        <div className="trick-area__trick-no">
          第 {trickNo} 墩
        </div>
        {leadLabel && <div>首出 {leadLabel}</div>}
        {trick.leadCount > 0 && <div>{trick.leadCount} 张</div>}
        {curPoints > 0 && (
          <div className="trick-area__points">本墩 {curPoints} 分</div>
        )}
        {currentLeader && (
          <div className="trick-area__leader">
            当前最大：{POSITION_NAME_ZH[currentLeader]}家
          </div>
        )}
        {trick.complete && trick.winner && (
          <div className="trick-area__winner">
            {POSITION_NAME_ZH[trick.winner]}家赢
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------

function PlaySlot({
  player,
  cards,
  attempt,
  attemptOpen,
  onToggleAttempt,
  isCurrentMax,
  isWinner,
  isLead,
  isTurn,
}: {
  player: PlayerPosition;
  cards: Card[];
  /** 甩牌失败时「原本想甩的牌」（本墩内展示在实际出牌旁） */
  attempt: Card[];
  /** 「欲甩的牌」折叠框是否展开 */
  attemptOpen: boolean;
  onToggleAttempt: () => void;
  isCurrentMax: boolean;
  isWinner: boolean;
  isLead: boolean;
  /** 是否轮到该玩家出牌（空位上显示箭头） */
  isTurn: boolean;
}) {
  const n = cards.length;
  const step = n > 1 ? Math.min(STEP_MAX, (SLOT_W - CARD_W) / (n - 1)) : 0;
  const cardsWidth = n > 0 ? (n - 1) * step + CARD_W : CARD_W;

  // 折叠框浮层：往牌桌外侧展开（西家向左，其余向右），不影响布局
  const sideLeft = player === PlayerPosition.West;
  const labelClass = isCurrentMax || isTurn
    ? 'play-slot__label play-slot__label--active'
    : isLead
      ? 'play-slot__label play-slot__label--lead'
      : 'play-slot__label';

  return (
    <div className="play-slot">
      {/* 方位标签 */}
      <div className={labelClass}>
        {POSITION_NAME_ZH[player]}家
        {isWinner ? ' 🏆' : isTurn ? ' · 出牌' : isCurrentMax ? ' · 当前最大' : isLead ? ' · 首出' : ''}
      </div>

      {/* 牌 */}
      <div className="play-slot__cards-outer">
        <div
          className="play-slot__cards"
          style={cssVars({ '--cards-width': `${cardsWidth}px` })}
        >
          {cards.map((c, i) => (
            <div
              key={c.id}
              className="play-slot__card"
              style={cssVars({
                '--card-index': i,
                '--card-step': `${step}px`,
              })}
            >
              <CardComponent card={c} faceUp={true} small={true} scale={CARD_SCALE} />
            </div>
          ))}

          {/* 甩牌失败：折叠框展示「欲甩的牌」（收起时只留一个标签） */}
          {attempt.length > 0 && (
            <div className={sideLeft
              ? 'play-slot__attempt play-slot__attempt--left'
              : 'play-slot__attempt'}
            >
              <button
                className="play-slot__attempt-toggle"
                onClick={onToggleAttempt}
              >
                ✗ 甩牌失败 · 欲甩 {attempt.length} 张 {attemptOpen ? '▾' : '▸'}
              </button>
              {attemptOpen && (
                <div className="play-slot__attempt-panel">
                  <div className="play-slot__attempt-title">
                    欲甩的牌（被拦，已改出最小的一组）
                  </div>
                  <div className="play-slot__attempt-cards">
                    {attempt.map(c => (
                      <CardComponent key={c.id} card={c} faceUp={true} small={true} scale={CARD_SCALE} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 轮到该玩家：空位上显示指向其方位的脉动箭头 */}
        {isTurn && n === 0 && (
          <div className="play-slot__turn-arrow">
            {TURN_ARROW[player]}
          </div>
        )}
      </div>
    </div>
  );
}
