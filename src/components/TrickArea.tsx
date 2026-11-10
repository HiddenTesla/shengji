// ============================================================
// 出牌区 —— 牌桌中央显示本墩四家的出牌
// 布局：北在上、南在下、西在左、东在右，中央为墩信息
// 样式：src/styles/components/_trick-area.scss（BEM）
// ============================================================

import { useMemo, useState } from 'react';
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
import {
  type Door,
  VOID_DOOR_COLOR,
  inferVoids,
  voidDoorLabel,
} from '../core/voids.ts';
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
/** 一手多张牌时的重叠步长上限 */
const STEP_MAX = 26;
/** 每手牌区域宽度（多张牌在此宽度内压缩重叠） */
const SLOT_W = 168;
/** 同时显示上一墩时：「上轮｜分隔线｜本墩」占用的总间隔（gap 4 + 线 1 + gap 4） */
const COMPARE_GAP = 9;
/** 同时显示上一墩时，每手牌的区域宽度上限（牌桌会随之变宽，太宽会挤压东西家出牌栏） */
const COMPARE_SLOT_MAX = 208;
/** 每组牌至少要露出的宽度（能看清左上角的点数 + 花色）占牌宽的比例 */
const STRIP_RATIO = 0.45;
/** 张数过多时牌面缩放的保底值（再小就没意义了，超出部分继续重叠） */
const COMPARE_MIN_SCALE = 0.3;

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
  // 「上轮出牌」：手动开关；勾选后上一墩的牌显示在左侧，本墩半透明显示
  const [showLast, setShowLast] = useState(false);
  const lastTrick = state.tricks.length > 0
    ? state.tricks[state.tricks.length - 1]
    : null;
  const compare = showLast && lastTrick !== null;
  // 勾选「显示上轮」时四家统一使用同一个宽度（取需要最宽的那家）：
  // 否则各槽位按自己张数变宽，左右两列不等宽 → 中间的信息 / 「显示上轮」会左右漂移。
  const compareWidth = useMemo(() => {
    if (!compare || !lastTrick) return null;
    return Math.max(...SLOTS.map(slot => compareSlotWidth(Math.max(
      trick.plays.find(p => p.player === slot.player)?.cards.length ?? 0,
      lastTrick.plays.find(p => p.player === slot.player)?.cards.length ?? 0,
    ))));
  }, [compare, lastTrick, trick.plays]);
  // 断门推断：只依据已出的牌（撤销后重算，自然回退）
  const voids = useMemo(
    () => inferVoids([...state.tricks, state.trick], trumpSuit, levelRank),
    [state.tricks, state.trick, trumpSuit, levelRank],
  );

  return (
    <div className="trick-area">
      {SLOTS.map(slot => {
        const play = trick.plays.find(p => p.player === slot.player);
        const isLeadSlot = play && play.player === trick.leadPlayer;
        const lastPlay = compare
          ? lastTrick.plays.find(p => p.player === slot.player)
          : undefined;
        return (
          <div
            key={slot.player}
            className="trick-area__slot"
            style={cssVars({ '--slot-col': slot.col, '--slot-row': slot.row })}
          >
            <PlaySlot
              player={slot.player}
              cards={play?.cards ?? []}
              voids={voids[slot.player]}
              lastCards={lastPlay?.cards ?? []}
              lastIsLead={compare && lastTrick.leadPlayer === slot.player}
              lastIsWinner={compare && lastTrick.winner === slot.player}
              dimCurrent={compare}
              compareWidth={compareWidth}
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
        {leadLabel && (
          <div>
            首出 {leadLabel} · {trick.leadCount} 张
          </div>
        )}
        {curPoints > 0 && (
          <div className="trick-area__points">本墩 {curPoints} 分</div>
        )}
        {trick.complete && trick.winner
          ? (
            <div className="trick-area__winner">
              {POSITION_NAME_ZH[trick.winner]}家赢
            </div>
          )
          : currentLeader && (
            <div className="trick-area__leader">
              当前最大：{POSITION_NAME_ZH[currentLeader]}家
            </div>
          )}
        {lastTrick && (
          <label
            className="trick-area__last-check"
            title="勾选后：左侧显示上一墩的牌，本墩半透明显示"
          >
            <input
              type="checkbox"
              className="trick-area__last-checkbox"
              checked={showLast}
              onChange={event => setShowLast(event.target.checked)}
            />
            <span className="trick-area__last-check-label">显示上轮</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------

/** 一组牌的叠放布局（步长 / 总宽 / 牌面缩放 / 牌高） */
interface CardLayout {
  step: number;
  width: number;
  scale: number;
  height: number;
}

function layoutAtScale(cards: Card[], width: number, scale: number): CardLayout {
  const n = cards.length;
  const cardW = 71 * scale;
  const step = n > 1 ? Math.min(STEP_MAX, (width - cardW) / (n - 1)) : 0;
  return {
    step,
    width: n > 0 ? (n - 1) * step + cardW : cardW,
    scale,
    height: 96 * scale,
  };
}

/** 一组牌在限定宽度内的重叠步长与总宽 */
function layoutCards(cards: Card[], width: number): CardLayout {
  return layoutAtScale(cards, width, CARD_SCALE);
}

/**
 * 勾选「显示上轮」时两组牌并排，每组只有一半宽度：张数一多就会叠成一摞看不清。
 * 所以先按张数把牌面缩小，保证每张牌都露出左上角的点数 + 花色
 * （缩放下限 COMPARE_MIN_SCALE，超过部分继续重叠）。
 */
function layoutCompare(cards: Card[], width: number): CardLayout {
  const n = cards.length;
  if (n <= 1) return layoutAtScale(cards, width, CARD_SCALE);
  // 步长 >= STRIP_RATIO * 牌宽 时，牌角才露得出来
  const maxCardW = width / (1 + STRIP_RATIO * (n - 1));
  const scale = Math.max(COMPARE_MIN_SCALE, Math.min(CARD_SCALE, maxCardW / 71));
  return layoutAtScale(cards, width, scale);
}

/** 勾选「显示上轮」时每手牌的区域宽度：按张数加宽，避免一摞牌叠在一起 */
function compareSlotWidth(n: number): number {
  const need = 2 * (CARD_W + Math.max(0, n - 1) * STEP_MAX) + COMPARE_GAP;
  return Math.min(COMPARE_SLOT_MAX, Math.max(SLOT_W, need));
}

function PlaySlot({
  player,
  cards,
  voids,
  lastCards,
  lastIsLead,
  lastIsWinner,
  dimCurrent,
  compareWidth,
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
  /** 该家已断的门（根据出牌推断；空数组 = 未断） */
  voids: Door[];
  /** 上一墩该家出的牌（勾选「显示上轮」时传入；空数组 = 不显示） */
  lastCards: Card[];
  /** 上一墩是否是这家领出 */
  lastIsLead: boolean;
  /** 上一墩是否是这家大出（赢墩） */
  lastIsWinner: boolean;
  /** 本墩的牌是否虚化（勾选「显示上轮」时） */
  dimCurrent: boolean;
  /** 四家统一的区域宽度（勾选「显示上轮」时；null = 未勾选） */
  compareWidth: number | null;
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
  const compare = lastCards.length > 0;
  // 两组并排时各占一半宽度；宽度由 TrickArea 统一给出，保证四家一致
  const outerW = compareWidth ?? SLOT_W;
  const groupW = compare ? (outerW - COMPARE_GAP) / 2 : outerW;
  const current = compare ? layoutCompare(cards, groupW) : layoutCards(cards, groupW);
  const previous = layoutCompare(lastCards, groupW);

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
        {voids.length > 0 && (
          <span
            className="play-slot__voids"
            title={`已断：${voids.map(doorLabel).join('、')}`}
          >
            断
            {voids.map(door => (
              <span
                key={door}
                className="play-slot__void"
                style={cssVars({ '--void-color': VOID_DOOR_COLOR[door] })}
              >
                {voidDoorLabel(door)}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* 牌 */}
      <div
        className={compare
          ? 'play-slot__cards-outer play-slot__cards-outer--compare'
          : 'play-slot__cards-outer'}
        style={cssVars({ '--cards-outer-w': `${outerW}px` })}
      >
        {/* 左：上一墩（保持清晰） */}
        {compare && (
          <div
            className="play-slot__cards play-slot__cards--last"
            style={cssVars({
              '--cards-width': `${previous.width}px`,
              '--card-h': `${previous.height}px`,
            })}
          >
            {lastCards.map((c, i) => (
              <div
                key={c.id}
                className="play-slot__card"
                style={cssVars({
                  '--card-index': i,
                  '--card-step': `${previous.step}px`,
                })}
              >
                <CardComponent
                  card={c}
                  faceUp={true}
                  small={true}
                  scale={previous.scale}
                />
              </div>
            ))}
            {/* 上一墩的角色：领出者 / 大出者（最高牌，赢墩） */}
            {lastIsLead && (
              <span
                className="play-slot__last-tag play-slot__last-tag--lead"
                title="上一墩领出"
              >
                首
              </span>
            )}
            {lastIsWinner && (
              <span
                className="play-slot__last-tag play-slot__last-tag--win"
                title="上一墩大出（赢墩）"
              >
                赢
              </span>
            )}
          </div>
        )}

        {/* 右：本墩（勾选时虚化） */}
        {compare && <span className="play-slot__divider" />}
        <div
          className={dimCurrent && n > 0
            ? 'play-slot__cards play-slot__cards--dim'
            : 'play-slot__cards'}
          style={cssVars({
            '--cards-width': `${current.width}px`,
            '--card-h': `${current.height}px`,
          })}
        >
          {cards.map((c, i) => (
            <div
              key={c.id}
              className="play-slot__card"
              style={cssVars({
                '--card-index': i,
                '--card-step': `${current.step}px`,
              })}
            >
              <CardComponent
                card={c}
                faceUp={true}
                small={true}
                scale={current.scale}
              />
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
