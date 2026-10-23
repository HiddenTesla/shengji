// ============================================================
// 四花色报主栏（仅南家，发牌/叫主阶段）
// ============================================================

import {
  type Card,
  type PlayerPosition,
  type RuleOptions,
  Rank,
  Suit,
  SUIT_SYMBOL,
} from '../core/types.ts';
import {
  type Declaration,
  BidStrength,
  canOverride,
  isSelfOverride,
} from '../core/bidding.ts';

interface BiddingBarProps {
  /** 该栏归属玩家（南家） */
  player: PlayerPosition;
  /** 当前手牌（发牌阶段会逐张增长） */
  hand: Card[];
  /** 当前级牌 */
  levelRank: Rank;
  /** 当前最高声明 */
  current: Declaration | null;
  /** 是否可操作（发牌/叫主阶段均可报主） */
  canAct: boolean;
  /** 叫主相关的规则开关 */
  rules: RuleOptions;
  onBid: (d: Declaration) => void;
  /**
   * 「不反主」：立即结束等待反主。
   * 仅在「发牌结束 + 已有人报主」时由 App 传入；未传则不显示按钮。
   */
  onPass?: () => void;
}

/** 四门花色顺序 */
const SUIT_LIST: readonly Suit[] = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond];

/** 花色颜色（与牌面一致） */
const SUIT_COLORS: Record<string, string> = {
  [Suit.Spade]: '#111111',   // 黑桃：纯黑
  [Suit.Heart]: '#c62828',   // 红心：深红
  [Suit.Club]: '#1b5e20',    // 梅花：墨绿
  [Suit.Diamond]: '#e65100', // 方块：橙红
  [Suit.Joker]: '#7c3aed',   // 王：紫色
};

/** 构建某花色的叫主声明 */
function buildSuitDecls(
  hand: Card[],
  suit: Suit,
  levelRank: Rank,
  player: PlayerPosition,
) {
  const levels = hand.filter(c => c.suit === suit && c.rank === levelRank);
  const nonLevel = hand.filter(c => c.suit === suit && c.rank !== levelRank);
  const single: Declaration | null = levels.length >= 1
    ? { player, suit, strength: BidStrength.Single, cardIds: [levels[0].id] }
    : null;
  const pair: Declaration | null = levels.length >= 2
    ? { player, suit, strength: BidStrength.Pair, cardIds: [levels[0].id, levels[1].id] }
    : null;
  return { levelCount: levels.length, nonLevelCount: nonLevel.length, single, pair };
}

export default function BiddingBar({
  player,
  hand,
  levelRank,
  current,
  canAct,
  rules,
  onBid,
  onPass,
}: BiddingBarProps) {
  // 无主（对小王 / 对大王；必须同大小，优先用更强的对大王）
  const smallJokers = hand.filter(
    c => c.suit === Suit.Joker && c.rank === Rank.SmallJoker,
  );
  const bigJokers = hand.filter(
    c => c.suit === Suit.Joker && c.rank === Rank.BigJoker,
  );
  const jokerDecl: Declaration | null = bigJokers.length >= 2
    ? {
        player,
        suit: null,
        strength: BidStrength.BigJokerPair,
        cardIds: [bigJokers[0].id, bigJokers[1].id],
      }
    : smallJokers.length >= 2
      ? {
          player,
          suit: null,
          strength: BidStrength.SmallJokerPair,
          cardIds: [smallJokers[0].id, smallJokers[1].id],
        }
      : null;

  // 无主（对小王 / 对大王）若是在压自己先前的有主声明，且规则不允许反自己，则禁用
  const jokerBlocked = jokerDecl !== null && current !== null
    && isSelfOverride(jokerDecl, current)
    && !rules.allowSelfOverride;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: 10,
      padding: '8px 14px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.93)',
      border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    }}>
      {/* 四色花列 */}
      {SUIT_LIST.map(suit => (
        <SuitColumn
          key={suit}
          suit={suit}
          hand={hand}
          levelRank={levelRank}
          player={player}
          current={current}
          canAct={canAct}
          rules={rules}
          onBid={onBid}
        />
      ))}

      {/* 右侧：无主 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingLeft: 10,
        borderLeft: '1px solid rgba(0,0,0,0.12)',
      }}>
        <BarButton
          label="🃏无主"
          color={SUIT_COLORS[Suit.Joker]}
          enabled={canAct && jokerDecl !== null && canOverride(jokerDecl, current, rules)}
          onClick={() => jokerDecl && onBid(jokerDecl)}
          title={jokerBlocked ? '不允许反自己亮的主' : undefined}
        />

        {/* 不反主：立即结束等待反主（发牌结束后、已有人报主时才出现） */}
        {onPass && (
          <button
            onClick={onPass}
            title="不反主：立即结束报主，直接开始埋底"
            style={{
              padding: '3px 8px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: 5,
              border: '1.5px solid #546e7a',
              background: 'rgba(84,110,122,0.1)',
              color: '#37474f',
              lineHeight: 1.1,
              minWidth: 44,
              whiteSpace: 'nowrap',
            }}
          >
            不反主
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------

function SuitColumn({
  suit,
  hand,
  levelRank,
  player,
  current,
  canAct,
  rules,
  onBid,
}: {
  suit: Suit;
  hand: Card[];
  levelRank: Rank;
  player: PlayerPosition;
  current: Declaration | null;
  canAct: boolean;
  rules: RuleOptions;
  onBid: (d: Declaration) => void;
}) {
  const color = SUIT_COLORS[suit];
  const { levelCount, nonLevelCount, single, pair } =
    buildSuitDecls(hand, suit, levelRank, player);

  const pairBlocked = pair !== null && current !== null
    && isSelfOverride(pair, current)
    && !rules.allowSelfOverride;
  const pairSelfProtect = pair !== null && current !== null
    && current.player === player
    && pair.suit === current.suit
    && pair.strength > current.strength;
  const pairTitle = pairBlocked
    ? '不允许反自己亮的主'
    : pairSelfProtect
      ? '自保：同花色补成对子'
      : '以对子反主';

  const singleEnabled = canAct && single !== null && canOverride(single, current, rules);
  const pairEnabled = canAct && pair !== null && canOverride(pair, current, rules);

  const singleTitle = levelCount >= 1 ? '报主该花色（亮一张）' : '无该花色级牌';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      minWidth: 54,
    }}>
      {/* 花色符号本身即「报主」按钮；不可用时禁用 */}
      <button
        onClick={() => single && onBid(single)}
        disabled={!singleEnabled}
        title={singleTitle}
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          lineHeight: 1,
          color: singleEnabled ? color : '#bdbdbd',
          background: singleEnabled ? `${color}14` : '#f2f2f2',
          border: `2px solid ${singleEnabled ? color : '#dcdcdc'}`,
          borderRadius: 9,
          cursor: singleEnabled ? 'pointer' : 'not-allowed',
          padding: 0,
        }}
      >
        {SUIT_SYMBOL[suit]}
      </button>

      {/* 该花色非级牌数量 */}
      <span style={{
        fontSize: 18,
        fontWeight: 700,
        color: '#333',
        lineHeight: 1,
      }}>
        {nonLevelCount}
      </span>

      {/* 反主按钮（仅当持有对子） */}
      {pair && (
        <BarButton
          label="反主"
          color={color}
          enabled={pairEnabled}
          onClick={() => onBid(pair)}
          title={pairTitle}
        />
      )}
    </div>
  );
}

function BarButton({
  label,
  color,
  enabled,
  onClick,
  title,
}: {
  label: string;
  color: string;
  enabled: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      title={title}
      style={{
        padding: '3px 8px',
        fontSize: 13,
        fontWeight: 600,
        cursor: enabled ? 'pointer' : 'not-allowed',
        borderRadius: 5,
        border: `1.5px solid ${enabled ? color : '#bbb'}`,
        background: enabled ? `${color}1a` : '#f0f0f0',
        color: enabled ? color : '#aaa',
        lineHeight: 1.1,
        minWidth: 44,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
