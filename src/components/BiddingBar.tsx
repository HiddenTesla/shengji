// ============================================================
// 四花色报主栏（仅南家，发牌/叫主阶段）
// 样式：src/styles/components/_bidding-bar.scss（BEM）
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
import { cssVars } from '../utils/cssVars.ts';

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
  // 无主（必须同大小的对王）：对大王 / 对小王 强弱不同，分成两个选项
  const smallJokers = hand.filter(
    c => c.suit === Suit.Joker && c.rank === Rank.SmallJoker,
  );
  const bigJokers = hand.filter(
    c => c.suit === Suit.Joker && c.rank === Rank.BigJoker,
  );
  const jokerOptions: {
    strength: BidStrength;
    label: string;
    decl: Declaration | null;
  }[] = [
    {
      strength: BidStrength.BigJokerPair,
      label: '无主·大王',
      decl: bigJokers.length >= 2
        ? {
            player,
            suit: null,
            strength: BidStrength.BigJokerPair,
            cardIds: [bigJokers[0].id, bigJokers[1].id],
          }
        : null,
    },
    {
      strength: BidStrength.SmallJokerPair,
      label: '无主·小王',
      decl: smallJokers.length >= 2
        ? {
            player,
            suit: null,
            strength: BidStrength.SmallJokerPair,
            cardIds: [smallJokers[0].id, smallJokers[1].id],
          }
        : null,
    },
  ];

  return (
    <div className="bidding-bar">
      {/* 四色花列：当前（暂时）主花色高亮 */}
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
          isCurrent={current !== null && current.suit === suit}
        />
      ))}

      {/* 无主：与四门花色同一层级，排在花色之后；大王 / 小王 分开显示 */}
      {jokerOptions.map(option => (
        <JokerColumn
          key={option.strength}
          label={option.label}
          decl={option.decl}
          isCurrent={current !== null
            && current.suit === null
            && current.strength === option.strength}
          canAct={canAct}
          current={current}
          rules={rules}
          onBid={onBid}
        />
      ))}

      {/* 不反主：结束等待的次级操作，与上面的报主选项分开展示 */}
      {onPass && (
        <div className="bidding-bar__pass-group">
          <button
            className="bidding-bar__pass"
            onClick={onPass}
            title="不反主：立即结束报主，直接开始埋底"
          >
            不反主
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------

function JokerColumn({
  label,
  decl,
  isCurrent,
  canAct,
  current,
  rules,
  onBid,
}: {
  /** 选项名（无主·大王 / 无主·小王） */
  label: string;
  /** 当前手牌能否做这个声明（null = 没有对应的对王） */
  decl: Declaration | null;
  isCurrent: boolean;
  canAct: boolean;
  current: Declaration | null;
  rules: RuleOptions;
  onBid: (d: Declaration) => void;
}) {
  const color = SUIT_COLORS[Suit.Joker];
  // 若是在压自己先前的有主声明，且规则不允许反自己，则禁用
  const blocked = decl !== null && current !== null
    && isSelfOverride(decl, current)
    && !rules.allowSelfOverride;
  const enabled = decl !== null && canAct && canOverride(decl, current, rules);
  const pairName = label.slice(-2);
  const title = blocked
    ? '不允许反自己亮的主'
    : decl
      ? `无主：用一对${pairName}亮`
      : `需要一对${pairName}`;
  const className = isCurrent
    ? 'bidding-bar__suit bidding-bar__suit--joker bidding-bar__suit--current'
    : 'bidding-bar__suit bidding-bar__suit--joker';

  return (
    <div className={className}>
      <button
        className={enabled
          ? 'bidding-bar__suit-button bidding-bar__suit-button--joker bidding-bar__suit-button--enabled'
          : 'bidding-bar__suit-button bidding-bar__suit-button--joker'}
        onClick={() => decl && onBid(decl)}
        disabled={!enabled}
        title={title}
        style={cssVars({
          '--suit-color': color,
          '--suit-tint': `${color}14`,
        })}
      >
        🃏
      </button>
      <span className="bidding-bar__joker-label">{label}</span>
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
  isCurrent,
}: {
  suit: Suit;
  hand: Card[];
  levelRank: Rank;
  player: PlayerPosition;
  current: Declaration | null;
  canAct: boolean;
  rules: RuleOptions;
  onBid: (d: Declaration) => void;
  /** 是否是当前（暂时）的主花色 */
  isCurrent: boolean;
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
    <div className={isCurrent
      ? 'bidding-bar__suit bidding-bar__suit--current'
      : 'bidding-bar__suit'}
    >
      {/* 花色符号本身即「报主」按钮；不可用时禁用 */}
      <button
        className={singleEnabled
          ? 'bidding-bar__suit-button bidding-bar__suit-button--enabled'
          : 'bidding-bar__suit-button'}
        onClick={() => single && onBid(single)}
        disabled={!singleEnabled}
        title={singleTitle}
        style={cssVars({
          '--suit-color': color,
          '--suit-tint': `${color}14`,
        })}
      >
        {SUIT_SYMBOL[suit]}
      </button>

      {/* 该花色非级牌数量 */}
      <span className="bidding-bar__count">
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
      className={enabled
        ? 'bidding-bar__action bidding-bar__action--enabled'
        : 'bidding-bar__action'}
      onClick={onClick}
      disabled={!enabled}
      title={title}
      style={cssVars({
        '--action-color': color,
        '--action-tint': `${color}1a`,
      })}
    >
      {label}
    </button>
  );
}
