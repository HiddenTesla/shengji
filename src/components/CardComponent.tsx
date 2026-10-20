// ============================================================
// 单张卡牌 SVG 渲染组件
// ============================================================

import { type Card, Suit, Rank, SUIT_SYMBOL, RANK_NAME } from '../core/types.ts'

interface CardComponentProps {
  card: Card
  faceUp?: boolean
  selected?: boolean
  small?: boolean
  badge?: string
  badgePosition?: 'top-right' | 'bottom-left'
  /** 额外缩放（1 = 不缩放）；配合 small 可渲染更小的牌（如出牌区） */
  scale?: number
  /**
   * 花色 / 王牌标记显示在点数右侧（东西家竖排时只露出牌顶一小条，
   * 花色在点数下方会看不见）
   */
  inlineSuit?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

const CARD_WIDTH = 71
const CARD_HEIGHT = 96
const CARD_RADIUS = 6

/** 牌面颜色 — 四花色各不同 */
function cardColor(suit: Suit): string {
  switch (suit) {
    case Suit.Spade:   return '#111111'   // 黑桃：纯黑
    case Suit.Heart:   return '#c62828'   // 红心：深红
    case Suit.Club:    return '#1b5e20'   // 梅花：墨绿
    case Suit.Diamond: return '#e65100'   // 方块：橙红
    case Suit.Joker:   return '#7c3aed'   // 王：紫色
  }
}

/** 牌面底色 */
function cardBg(suit: Suit): string {
  if (suit === Suit.Joker) return '#faf5ff'
  return '#fff'
}

/** 渲染花色小符号 */
function SuitSymbol({ suit, x, y, size }: {
  suit: Suit
  x: number
  y: number
  size: number
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
  )
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
  )
}

/** Joker 牌面 */
function JokerFace({ card, small, inlineSuit }: {
  card: Card
  small?: boolean
  inlineSuit?: boolean
}) {
  const isBig = card.rank === Rank.BigJoker
  const label = isBig ? '大\n王' : '小\n王'
  const color = isBig ? '#c62828' : '#1565c0'

  return (
    <g>
      <rect
        x={0} y={0}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={CARD_RADIUS}
        ry={CARD_RADIUS}
        fill="#faf5ff"
        stroke="#7c3aed"
        strokeWidth={1.5}
      />
      <text
        x={CARD_WIDTH / 2}
        y={CARD_HEIGHT / 2 - 2}
        fontSize={small ? 20 : 26}
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="bold"
      >
        {label}
      </text>
      <text
        x={CARD_WIDTH / 2}
        y={CARD_HEIGHT / 2 + (small ? 14 : 18)}
        fontSize={small ? 9 : 11}
        fill="#7c3aed"
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight={500}
      >
        {isBig ? 'BIG JOKER' : 'SMALL JOKER'}
      </text>
      {inlineSuit
        ? (
          <>
            {/* 紧凑模式：大小王 + 王牌标记同一行，露出牌顶时也能分辨 */}
            <text
              x={7}
              y={small ? 21 : 23}
              fontSize={small ? 15 : 17}
              fill={color}
              textAnchor="start"
              dominantBaseline="central"
              fontWeight="bold"
            >
              {isBig ? '大王' : '小王'}
            </text>
            <SuitSymbol
              suit={Suit.Joker}
              x={small ? 53 : 56}
              y={small ? 21 : 23}
              size={small ? 15 : 17}
            />
          </>
        )
        : (
          <SuitSymbol
            suit={Suit.Joker}
            x={small ? 14 : 16}
            y={small ? 20 : 22}
            size={small ? 16 : 20}
          />
        )}
      <SuitSymbol
        suit={Suit.Joker}
        x={small ? CARD_WIDTH - 14 : CARD_WIDTH - 16}
        y={small ? CARD_HEIGHT - 20 : CARD_HEIGHT - 22}
        size={small ? 16 : 20}
      />
    </g>
  )
}

/** 标准牌面 — 大号点数和花色 */
function NormalFace({ card, small, inlineSuit }: {
  card: Card
  small?: boolean
  inlineSuit?: boolean
}) {
  const color = cardColor(card.suit)
  const bg = cardBg(card.suit)
  const rankName = RANK_NAME[card.rank]
  const suitSymbol = SUIT_SYMBOL[card.suit]

  // 手牌（small）模式也保持足够大的点数/花色，并留出边距
  const rankSize = small ? 23 : 20
  const suitCornerSize = small ? 18 : 15
  const centerSize = small ? 40 : 42
  const cornerX = 12
  const rankY = 26
  const suitY = 43
  // 紧凑模式（花色在点数右侧）
  const inlineRankSize = small ? 22 : 20
  const inlineSuitSize = small ? 17 : 15
  const inlineY = 21
  const inlineSuitX = rankName.length > 1 ? 45 : 32

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
  )
}

export default function CardComponent({
  card,
  faceUp = true,
  selected = false,
  small = false,
  badge,
  badgePosition = 'bottom-left',
  scale,
  inlineSuit = false,
  onClick,
  style,
}: CardComponentProps) {
  const s = scale ?? (small ? 0.95 : 1)
  const w = CARD_WIDTH * s
  const h = CARD_HEIGHT * s

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        filter: selected ? 'drop-shadow(0 0 6px #ffd700)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
        transform: selected ? 'translateY(-8px)' : 'translateY(0)',
        transition: 'transform 0.15s, filter 0.15s',
        ...style,
      }}
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
    </svg>
  )
}
