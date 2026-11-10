// ============================================================
// 记牌器 —— 查看「已出牌 / 剩余牌」
// 按「门」分类：主牌门（大小王 + 级牌 + 主花色）合成一行，按牌力从大到小排列；
// 其余三家花色各一组（去掉级牌，因为级牌属于主牌门）。
// 视角：剩余 = 全副牌 - 已出 - 该家自己的手牌（即自己看不到的牌）。
// 样式：src/styles/components/_card-tracker-dialog.scss（BEM）
// ============================================================

import { useMemo, useState } from 'react';
import {
  type Card,
  type PlayedCards,
  type PlayerPosition,
  POSITION_NAME_ZH,
  PlayerPosition as Pos,
  Rank,
  RANK_NAME,
  Suit,
  SUIT_SYMBOL,
} from '../core/types.ts';
import { cssVars } from '../utils/cssVars.ts';
import ConfirmDialog from './ConfirmDialog.tsx';

interface CardTrackerDialogProps {
  open: boolean;
  /** 本局已经出的每一手牌（含出牌人；含当前墩已出的牌） */
  plays: PlayedCards[];
  /** 四家当前手牌（用于按视角排除本家手牌） */
  hands: Record<PlayerPosition, Card[]>;
  /** 本局主牌花色（null = 无主） */
  trumpSuit: Suit | null;
  /** 本局级牌 */
  levelRank: Rank;
  onClose: () => void;
}

/** 视角列表的顺序（东 → 南 → 西 → 北） */
const SEAT_ORDER: PlayerPosition[] = [Pos.East, Pos.South, Pos.West, Pos.North];

/** 视角：某一家（排除该家手牌）或裁判（不减任何手牌） */
type TrackerView = PlayerPosition | 'referee';

/** 两副牌：每种牌 2 张 */
const COPIES_PER_TYPE = 2;
/** 全副牌张数（54 × 2） */
const TOTAL_CARDS = 108;

/** 花色行（顺序固定） */
const SUIT_ROWS: Suit[] = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond];

/** 点数从大到小 */
const RANK_ORDER: Rank[] = [
  Rank.Ace,
  Rank.King,
  Rank.Queen,
  Rank.Jack,
  Rank.Ten,
  Rank.Nine,
  Rank.Eight,
  Rank.Seven,
  Rank.Six,
  Rank.Five,
  Rank.Four,
  Rank.Three,
  Rank.Two,
];

/** 深色背景上的花色文字颜色（与等级面板一致） */
const SUIT_TEXT_COLOR: Record<Suit, string> = {
  [Suit.Spade]: '#f2f2f2',
  [Suit.Heart]: '#ff6b6b',
  [Suit.Club]: '#7bd88f',
  [Suit.Diamond]: '#ffb74d',
  [Suit.Joker]: '#d0a0ff',
};

/** 一行里的一个格子 */
interface TrackerCard {
  suit: Suit;
  rank: Rank;
  /** 是否在点数前显示花色（一行里混门时用：级牌 / 王） */
  showSuit?: boolean;
}

/** 一行（一个「门」） */
interface TrackerGroup {
  key: string;
  /** 行首标签：花色符号或文字 */
  label: string;
  /** 行首标签颜色 */
  color: string;
  /** 是否显示「主」徽标 */
  badge?: boolean;
  cards: TrackerCard[];
}

function cardKey(suit: Suit, rank: Rank): string {
  return `${suit}-${rank}`;
}

export default function CardTrackerDialog({
  open,
  plays,
  hands,
  trumpSuit,
  levelRank,
  onClose,
}: CardTrackerDialogProps) {
  /** 视角：默认「裁判」（不减任何手牌）；选某一家时排除该家手牌 */
  const [seat, setSeat] = useState<TrackerView>('referee');

  // 每种牌已出的张数
  const playedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const play of plays) {
      for (const card of play.cards) {
        const key = cardKey(card.suit, card.rank);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [plays]);

  // 该视角玩家手上每种牌的张数（用于从「剩余」中排除；裁判视角不排除）
  const seatHandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (seat === 'referee') return counts;
    for (const card of hands[seat] ?? []) {
      const key = cardKey(card.suit, card.rank);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [hands, seat]);

  // 按「门」分组：主牌门（王 + 级牌 + 主花色）在前，其余花色在后
  const groups = useMemo<TrackerGroup[]>(() => {
    const result: TrackerGroup[] = [];
    const jokers: TrackerCard[] = [
      { suit: Suit.Joker, rank: Rank.BigJoker },
      { suit: Suit.Joker, rank: Rank.SmallJoker },
    ];
    if (trumpSuit !== null) {
      // 主牌门：从大到小 = 大王 → 小王 → 主级牌 → 副级牌 → 主花色 A…3
      result.push({
        key: 'trump',
        label: SUIT_SYMBOL[trumpSuit],
        color: SUIT_TEXT_COLOR[trumpSuit],
        badge: true,
        cards: [
          ...jokers,
          { suit: trumpSuit, rank: levelRank, showSuit: true },
          ...SUIT_ROWS
            .filter(suit => suit !== trumpSuit)
            .map(suit => ({ suit, rank: levelRank, showSuit: true })),
          ...RANK_ORDER
            .filter(rank => rank !== levelRank)
            .map(rank => ({ suit: trumpSuit, rank })),
        ],
      });
    } else {
      // 无主：大小王 + 四门级牌 组成主牌门
      result.push({
        key: 'trump',
        label: '主',
        color: SUIT_TEXT_COLOR[Suit.Joker],
        cards: [
          ...jokers,
          ...SUIT_ROWS.map(suit => ({ suit, rank: levelRank, showSuit: true })),
        ],
      });
    }
    // 其余花色（副牌门）：去掉级牌
    for (const suit of SUIT_ROWS) {
      if (suit === trumpSuit) continue;
      result.push({
        key: `suit-${suit}`,
        label: SUIT_SYMBOL[suit],
        color: SUIT_TEXT_COLOR[suit],
        cards: RANK_ORDER
          .filter(rank => rank !== levelRank)
          .map(rank => ({ suit, rank })),
      });
    }
    return result;
  }, [trumpSuit, levelRank]);

  const playedOf = (suit: Suit, rank: Rank) =>
    playedCounts.get(cardKey(suit, rank)) ?? 0;
  const seatHandOf = (suit: Suit, rank: Rank) =>
    seatHandCounts.get(cardKey(suit, rank)) ?? 0;
  /** 该牌还剩几张是「看不到的」（排除已出与该视角玩家的手牌） */
  const unseenOf = (suit: Suit, rank: Rank) =>
    Math.max(0, COPIES_PER_TYPE - playedOf(suit, rank) - seatHandOf(suit, rank));

  const totalPlayed = plays.reduce((sum, play) => sum + play.cards.length, 0);
  const seatHandSize = seat === 'referee' ? 0 : (hands[seat] ?? []).length;
  const remaining = TOTAL_CARDS - totalPlayed - seatHandSize;
  const seatName = seat === 'referee' ? '裁判' : `${POSITION_NAME_ZH[seat]}家`;

  return (
    <ConfirmDialog
      open={open}
      title="记牌器"
      description={`视角：${seatName} · 已出 ${totalPlayed} 张 · 剩余 ${remaining} 张`}
      confirmLabel="关闭"
      hideCancel={true}
      width={990}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <div className="tracker">
        {/* 视角切换：剩余 = 全副牌 − 已出 − 本家手牌 */}
        <div className="tracker__perspective">
          <span className="tracker__perspective-label">视角</span>
          {SEAT_ORDER.map(pos => (
            <button
              key={pos}
              className={pos === seat
                ? 'tracker-seat tracker-seat--active'
                : 'tracker-seat'}
              onClick={() => setSeat(pos)}
            >
              {POSITION_NAME_ZH[pos]}家
            </button>
          ))}
          <button
            className={seat === 'referee'
              ? 'tracker-seat tracker-seat--active'
              : 'tracker-seat'}
            title="裁判视角：不减去任何一家的手牌"
            onClick={() => setSeat('referee')}
          >
            裁判
          </button>
          <span className="tracker__perspective-hint">
            {seat === 'referee'
              ? '剩余 = 全副牌 − 已出'
              : `剩余 = 全副牌 − 已出 − ${seatName}手牌`}
          </span>
        </div>

        {/* 按门分组的行（主牌门在前） */}
        {groups.map(group => (
          <div key={group.key} className="tracker__row">
            <div
              className="tracker__suit"
              style={cssVars({ '--suit-color': group.color })}
            >
              <span className={group.badge
                ? 'tracker__suit-symbol'
                : 'tracker__group-label'}
              >
                {group.label}
              </span>
              {group.badge && (
                <span className="tracker__trump tracker__trump--on">主</span>
              )}
            </div>
            {group.cards.map(({ suit, rank, showSuit }) => (
              <TrackerCell
                key={cardKey(suit, rank)}
                suit={suit}
                rank={rank}
                showSuit={showSuit === true}
                played={playedOf(suit, rank)}
                unseen={unseenOf(suit, rank)}
                isLevel={rank === levelRank}
              />
            ))}
          </div>
        ))}
      </div>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------

function TrackerCell({
  suit,
  rank,
  showSuit,
  played,
  unseen,
  isLevel,
}: {
  suit: Suit;
  rank: Rank;
  /** 是否在点数前显示花色（副级牌 / 王 行） */
  showSuit: boolean;
  /** 已经出了几张 */
  played: number;
  /** 还有几张是看不到的（排除本家手牌） */
  unseen: number;
  /** 是否是本局级牌 */
  isLevel: boolean;
}) {
  const className = [
    'tracker-cell',
    isLevel ? 'tracker-cell--level' : '',
    unseen === 0 ? 'tracker-cell--gone' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      title={`${RANK_NAME[rank]}：已出 ${played} 张，剩余 ${unseen} 张`}
    >
      <span className="tracker-cell__rank">
        {showSuit && suit !== Suit.Joker && (
          <span
            className="tracker-cell__suit"
            style={cssVars({ '--suit-color': SUIT_TEXT_COLOR[suit] })}
          >
            {SUIT_SYMBOL[suit]}
          </span>
        )}
        {RANK_NAME[rank]}
      </span>
      <span className="tracker-cell__remain">
        剩 {unseen}
      </span>
      <span className="tracker-cell__played">
        已 {played}
      </span>
    </div>
  );
}
