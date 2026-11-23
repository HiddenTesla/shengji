// ============================================================
// 单张卡牌 SVG 渲染组件
// ============================================================

import { type Card, Suit, Rank, SUIT_SYMBOL, RANK_NAME } from '../core/types.ts';
import clownUrl from '../assets/joker/clown.svg';

interface CardComponentProps {
  card: Card;
  faceUp?: boolean;
  selected?: boolean;
  small?: boolean;
  badge?: string;
  badgePosition?: 'top-right' | 'bottom-left';
  /** 额外标记（如手牌里的对子 / 拖拉机）；position 默认左下角 */
  mark?: {
    text: string;
    color: string;
    /** 竖排（东/西家）只露出牌顶，标记需要放到右上角 */
    position?: 'bottom-left' | 'top-right';
    /**
     * 标记角标的放大倍数（默认 1）。牌本身通过 scale 缩得很小时用它把
     * 「对 / 拖」保持在可读尺寸（如初始手牌回顾里的 0.52 倍小牌）。
     */
    size?: number;
  };
  /** 额外缩放（1 = 不缩放）；配合 small 可渲染更小的牌（如出牌区） */
  scale?: number;
  /**
   * 花色 / 王牌标记显示在点数右侧（东西家竖排时只露出牌顶一小条，
   * 花色在点数下方会看不见）
   */
  inlineSuit?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const CARD_WIDTH = 71;
const CARD_HEIGHT = 96;
const CARD_RADIUS = 6;

/** 牌面颜色 — 四花色各不同 */
function cardColor(suit: Suit): string {
  switch (suit) {
    case Suit.Spade:   return '#111111';   // 黑桃：纯黑
    case Suit.Heart:   return '#c62828';   // 红心：深红
    case Suit.Club:    return '#1b5e20';   // 梅花：墨绿
    case Suit.Diamond: return '#e65100';   // 方块：橙红
    case Suit.Joker:   return '#7c3aed';   // 王：紫色
  }
}

/** 牌面底色 */
function cardBg(suit: Suit): string {
  if (suit === Suit.Joker) return '#faf5ff';
  return '#fff';
}

/** 渲染花色小符号 */
function SuitSymbol({ suit, x, y, size }: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={cardColor(suit)}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="Arial, sans-serif"
    >
      {SUIT_SYMBOL[suit]}
    </text>
  );
}

/** 卡牌背面图案 */
function CardBack() {
  return (
    <g>
      <rect
        x={0} y={0}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={CARD_RADIUS}
        ry={CARD_RADIUS}
        fill="#1565c0"
      />
      <rect
        x={3} y={3}
        width={CARD_WIDTH - 6}
        height={CARD_HEIGHT - 6}
        rx={CARD_RADIUS - 2}
        ry={CARD_RADIUS - 2}
        fill="none"
        stroke="#42a5f5"
        strokeWidth={1.5}
      />
      {/* 菱形花纹 */}
      <defs>
        <pattern
          id="cardBackPattern"
          x={0} y={0}
          width={14}
          height={14}
          patternUnits="userSpaceOnUse"
        >
          <rect width={14} height={14} fill="#1565c0" />
          <rect x={3} y={3} width={8} height={8} fill="#1976d2" rx={1} />
        </pattern>
      </defs>
      <rect
        x={8} y={8}
        width={CARD_WIDTH - 16}
        height={CARD_HEIGHT - 16}
        rx={3}
        ry={3}
        fill="url(#cardBackPattern)"
      />
      {/* 中心图标 */}
      <text
        x={CARD_WIDTH / 2}
        y={CARD_HEIGHT / 2}
        fontSize={24}
        fill="#42a5f5"
        textAnchor="middle"
        dominantBaseline="central"
        opacity={0.8}
      >
        ♠♥♣♦
      </text>
    </g>
  );
}

/**
 * 王牌牌面：clown.svg 小丑帽徽章 + 大王/小王。
 * 大王用彩色版；小王用同一张 SVG + 灰度滤镜（黑白色）。
 */
function JokerFace({ card, small, inlineSuit }: {
  card: Card;
  small?: boolean;
  inlineSuit?: boolean;
}) {
  const isBig = card.rank === Rank.BigJoker;
  const theme = isBig
    ? { cardBg: '#fffdf4', border: '#7b1fa2', label: '#6a1b9a', sub: '#7b1fa2' }
    : { cardBg: '#fafafa', border: '#616161', label: '#212121', sub: '#616161' };
  const artStyle = isBig ? undefined : { filter: 'grayscale(1)' };
  /** 绘制 clown.svg（cx/cy = 中心，size = 边长） */
  const art = (cx: number, cy: number, size: number) => (
    <image
      href={clownUrl}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      style={artStyle}
    />
  );

  return (
    <g>
      <rect
        x={0} y={0}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={CARD_RADIUS}
        ry={CARD_RADIUS}
        fill={theme.cardBg}
        stroke={theme.border}
        strokeWidth={1.5}
      />

      {/* 中央小丑帽徽章 */}
      {art(CARD_WIDTH / 2, small ? 46 : 47.5, small ? 38 : 44)}

      {/* 大王 / 小王 */}
      <text
        x={CARD_WIDTH / 2}
        y={small ? 15 : 16}
        fontSize={small ? 11 : 13}
        fill={theme.label}
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="bold"
      >
        {isBig ? '大王' : '小王'}
      </text>

      <text
        x={CARD_WIDTH / 2}
        y={small ? 86 : 89}
        fontSize={small ? 6 : 6.5}
        fill={theme.sub}
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight={500}
        letterSpacing={0.3}
      >
        {isBig ? 'BIG JOKER' : 'SMALL JOKER'}
      </text>

      {inlineSuit
        ? (
          <>
            {/* 紧凑模式：大小王 + 小丑帽徽章同一行，露出牌顶时也能分辨 */}
            <text
              x={7}
              y={small ? 21 : 23}
              fontSize={small ? 15 : 17}
              fill={theme.label}
              textAnchor="start"
              dominantBaseline="central"
              fontWeight="bold"
            >
              {isBig ? '大王' : '小王'}
            </text>
            {art(small ? 53 : 56, small ? 21 : 23, small ? 15 : 17)}
          </>
        )
        : art(small ? 14 : 15, small ? 17 : 18, small ? 15 : 17)}

      {/* 右下角小丑帽 */}
      {art(small ? CARD_WIDTH - 13 : CARD_WIDTH - 14, small ? CARD_HEIGHT - 17 : CARD_HEIGHT - 18, small ? 15 : 17)}
    </g>
  );
}

/** 标准牌面 — 大号点数和花色 */
function NormalFace({ card, small, inlineSuit }: {
  card: Card;
  small?: boolean;
  inlineSuit?: boolean;
}) {
  const color = cardColor(card.suit);
  const bg = cardBg(card.suit);
  const rankName = RANK_NAME[card.rank];
  const suitSymbol = SUIT_SYMBOL[card.suit];

  // 手牌（small）模式也保持足够大的点数/花色，并留出边距
  const rankSize = small ? 23 : 20;
  const suitCornerSize = small ? 18 : 15;
  const centerSize = small ? 40 : 42;
  const cornerX = 12;
  const rankY = 26;
  const suitY = 43;
  // 紧凑模式（花色在点数右侧）
  const inlineRankSize = small ? 22 : 20;
  const inlineSuitSize = small ? 17 : 15;
  const inlineY = 21;
  const inlineSuitX = rankName.length > 1 ? 45 : 32;

  return (
    <g>
      {/* 牌面白底 */}
      <rect
        x={0} y={0}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={CARD_RADIUS}
        ry={CARD_RADIUS}
        fill={bg}
        stroke="#ccc"
        strokeWidth={1}
      />
      {inlineSuit
        ? (
          <>
            {/* 紧凑模式：点数与花色同一行（东西家竖排只露出牌顶一条） */}
            <text
              x={7}
              y={inlineY}
              fontSize={inlineRankSize}
              fill={color}
              fontWeight="bold"
              dominantBaseline="central"
              fontFamily="Arial, sans-serif"
            >
              {rankName}
            </text>
            <SuitSymbol
              suit={card.suit}
              x={inlineSuitX}
              y={inlineY}
              size={inlineSuitSize}
            />
          </>
        )
        : (
          <>
            {/* 左上角点数 */}
            <text
              x={cornerX}
              y={rankY}
              fontSize={rankSize}
              fill={color}
              fontWeight="bold"
              fontFamily="Arial, sans-serif"
            >
              {rankName}
            </text>
            {/* 左上角花色 */}
            <SuitSymbol
              suit={card.suit}
              x={cornerX + 8}
              y={suitY}
              size={suitCornerSize}
            />
          </>
        )}
      {/* 中央大花色 — 几乎占满牌面 */}
      <text
        x={CARD_WIDTH / 2}
        y={CARD_HEIGHT / 2 + 2}
        fontSize={centerSize}
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
      >
        {suitSymbol}
      </text>
      {/* 对角位置的点数 + 花色 */}
      {!small && (
        <>
          <text
            x={CARD_WIDTH - cornerX}
            y={CARD_HEIGHT - rankY + 4}
            fontSize={rankSize}
            fill={color}
            textAnchor="end"
            fontWeight="bold"
            fontFamily="Arial, sans-serif"
            transform={`rotate(180, ${CARD_WIDTH - cornerX}, ${CARD_HEIGHT - rankY + 4})`}
          >
            {rankName}
          </text>
          <SuitSymbol
            suit={card.suit}
            x={CARD_WIDTH - cornerX - 8}
            y={CARD_HEIGHT - suitY + 2}
            size={suitCornerSize}
          />
        </>
      )}
    </g>
  );
}

export default function CardComponent({
  card,
  faceUp = true,
  selected = false,
  small = false,
  badge,
  badgePosition = 'bottom-left',
  mark,
  scale,
  inlineSuit = false,
  onClick,
  style,
}: CardComponentProps) {
  const s = scale ?? (small ? 0.95 : 1);
  const w = CARD_WIDTH * s;
  const h = CARD_HEIGHT * s;
  // 标记位置：默认左下角；竖排时用右上角（底部会被下一张牌遮住）
  const markAtTop = mark?.position === 'top-right';
  const markScale = mark?.size ?? 1;
  const markW = 19 * markScale;
  const markH = 15 * markScale;
  const markX = markAtTop ? CARD_WIDTH - 3 - markW : 3;
  // size = 1 时保持原位置（内置「底」角标在下 / 左，标记向上让位），放大时同样贴底
  const markY = markAtTop
    ? (badge ? 21 : 3)
    : (badge ? 61 : 78) - (markH - 15);
  const className = [
    'card',
    onClick && 'card--clickable',
    selected && 'card--selected',
  ].filter(Boolean).join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      className={className}
      data-card-id={card.id}
      style={style}
      onClick={onClick}
    >
      {faceUp
        ? (
          card.suit === Suit.Joker
            ? <JokerFace card={card} small={small} inlineSuit={inlineSuit} />
            : <NormalFace card={card} small={small} inlineSuit={inlineSuit} />
        )
        : <CardBack />}
      {faceUp && badge && (
        <g>
          <rect
            x={badgePosition === 'top-right' ? 49 : 3}
            y={badgePosition === 'top-right' ? 3 : 78}
            width={19}
            height={15}
            rx={4}
            fill="#1565c0"
            stroke="#fff"
            strokeWidth={0.75}
          />
          <text
            x={badgePosition === 'top-right' ? 58.5 : 12.5}
            y={badgePosition === 'top-right' ? 10.5 : 85.5}
            fontSize={10}
            fill="#fff"
            textAnchor="middle"
            dominantBaseline="central"
            fontWeight="bold"
          >
            {badge}
          </text>
        </g>
      )}
      {faceUp && mark && (
        <g>
          <rect
            x={markX}
            y={markY}
            width={markW}
            height={markH}
            rx={4 * markScale}
            fill={mark.color}
            stroke="#fff"
            strokeWidth={0.75}
          />
          <text
            x={markX + markW / 2}
            y={markY + markH / 2}
            fontSize={10 * markScale}
            fill="#fff"
            textAnchor="middle"
            dominantBaseline="central"
            fontWeight="bold"
          >
            {mark.text}
          </text>
        </g>
      )}
    </svg>
  );
}
