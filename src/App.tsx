// ============================================================
// 根组件 — 游戏主面板
// ============================================================

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  type Card,
  type RuleOptions,
  Rank,
  PlayerPosition,
  POSITION_NAME_ZH,
  PlayerMode,
  GamePhase,
  Suit,
  ALL_POSITIONS,
  SUIT_SYMBOL,
  RANK_NAME,
  Team,
  TEAM_NAME_ZH,
  DEFAULT_RULE_OPTIONS,
  partnerOf,
  teamOf,
} from './core/types.ts';
import { groupCardsForDisplay } from './core/card.ts';
import { createDecks, shuffleCards, dealCards } from './core/deck.ts';
import {
  type Declaration,
  type BidState,
  BidStrength,
  aiChooseDeclare,
  canOverride,
  createBidState,
  decisiveBottomIndex,
  determineTrumpFromBottom,
} from './core/bidding.ts';
import { aiChooseBury, countPoints } from './core/bury.ts';
import {
  type LapBoard,
  type LevelBoard,
  LEVEL_RANKS,
  formatLap,
  initialLapBoard,
  initialLevelBoard,
  settleLevel,
} from './core/rank.ts';
import {
  type PlayState,
  type TrickState,
  applyPlay,
  canBeatCurrentPlay,
  collectTrick,
  createPlayState,
  currentTrickLeader,
  isLeading,
  validatePlay,
} from './core/play.ts';
import { type HandShape, mandatoryFollowCards } from './core/hand.ts';
import { aiChoosePlay } from './core/ai.ts';
import {
  type RoundRecord,
  appendPlay,
  buildCardIdMap,
  buildPlayLog,
  closeLastTrick,
  createRoundRecord,
  encodeCards,
  serializePlayLog,
  truncateRecord,
} from './core/playlog.ts';
import PlayerHand from './components/PlayerHand.tsx';
import OpponentHand from './components/OpponentHand.tsx';
import PlayerModeButton from './components/PlayerModeButton.tsx';
import MenuBar, { MENU_BAR_OFFSET } from './components/MenuBar.tsx';
import ConfirmDialog from './components/ConfirmDialog.tsx';
import BiddingBar from './components/BiddingBar.tsx';
import BottomCards from './components/BottomCards.tsx';
import BottomReveal from './components/BottomReveal.tsx';
import TrickArea from './components/TrickArea.tsx';
import PlayBar from './components/PlayBar.tsx';
import RoundSettlement from './components/RoundSettlement.tsx';
import PlayLogDialog from './components/PlayLogDialog.tsx';
import CardComponent from './components/CardComponent.tsx';

type Hands = Record<PlayerPosition, Card[]>

/**
 * 跟牌「必出牌」→ 在 `groupCardsForDisplay(...).flatMap(g => g.cards)` 中的下标。
 * UI 的选中态就是这套下标（南家 / 北家 / 东家 / 西家共用同一顺序）。
 */
function forcedFollowIndicesOf(
  hand: Card[],
  trick: TrickState,
  trumpSuit: Suit | null,
  levelRank: Rank,
): Set<number> {
  const result = new Set<number>();
  if (trick.complete || trick.leadDoor === null || trick.leadCount <= 0) {
    return result;
  }

  const lead: HandShape = {
    type: trick.leadType,
    door: trick.leadDoor,
    count: trick.leadCount,
    pairs: trick.leadPairs,
    tractor: trick.leadTractor,
  };
  const forced = mandatoryFollowCards(hand, lead, trumpSuit, levelRank);
  if (forced.length === 0) return result;

  const ids = new Set(forced.map(c => c.id));
  const flat = groupCardsForDisplay(hand, trumpSuit, levelRank)
    .flatMap(g => g.cards);
  flat.forEach((card, index) => {
    if (ids.has(card.id)) result.add(index);
  });
  return result;
}

/** 撤销快照：记录一次动作前的完整状态（玩家与托管动作均记录） */
interface UndoSnapshot {
  /** 该快照对应的动作（用于按钮提示） */
  kind: 'bury' | 'play';
  /** 是否由玩家（手动）做出；false = 托管 AI 动作 */
  manual: boolean;
  hands: Hands;
  playState: PlayState | null;
  phase: GamePhase;
  /** 埋底后的底牌 */
  buriedCards: Card[];
  /** bottomRef 的值（原始底牌 / 已埋底牌） */
  bottom: Card[];
  /** 日志：快照时的墩数（撤销时截断） */
  logTricks: number;
  /** 日志：快照时最后一墩的出牌数 */
  logLastPlays: number;
}

/** 发牌结束后的叫主窗口时长（秒） */
const BID_WINDOW_SECONDS = 8;
/** 倒计时期间首次报主时，至少保留的叫主时间 */
const FIRST_BID_MIN_REMAINING_SECONDS = 5;

/** 底牌张数（= 庄家埋底张数） */
const BOTTOM_COUNT = 8;
const SPEED_MULTIPLIERS = [2.0, 1.2, 0.7, 0.4, 0.2] as const;

/** 深色背景上的主花色文字颜色（黑桃用白色，否则看不清） */
const TRUMP_TEXT_COLORS: Record<Suit, string> = {
  [Suit.Spade]: '#ffffff',
  [Suit.Heart]: '#ff6b6b',
  [Suit.Club]: '#7bd88f',
  [Suit.Diamond]: '#ffb74d',
  [Suit.Joker]: '#d0a0ff',
};

/**
 * 闲家得分颜色：分数越高越危险（0 = 绿，接近 80 = 橙黄，80 = 橙红，越大越红）。
 * 分段线性插值，保证数值连续变化时颜色也平滑过渡。
 */
const DEFENDING_SCORE_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [126, 231, 135] },    // 绿
  { at: 40, rgb: [205, 220, 57] },    // 黄绿
  { at: 65, rgb: [255, 202, 40] },    // 橙黄（接近 80）
  { at: 80, rgb: [255, 112, 67] },    // 橙红（上台线）
  { at: 120, rgb: [244, 81, 30] },    // 红
  { at: 160, rgb: [211, 47, 47] },    // 深红
  { at: 200, rgb: [139, 0, 0] },      // 暗红
];

function defendingScoreColor(points: number): string {
  const first = DEFENDING_SCORE_STOPS[0];
  const last = DEFENDING_SCORE_STOPS[DEFENDING_SCORE_STOPS.length - 1];
  if (points <= first.at) return `rgb(${first.rgb.join(', ')})`;
  if (points >= last.at) return `rgb(${last.rgb.join(', ')})`;
  for (let i = 1; i < DEFENDING_SCORE_STOPS.length; i++) {
    const hi = DEFENDING_SCORE_STOPS[i];
    const lo = DEFENDING_SCORE_STOPS[i - 1];
    if (points <= hi.at) {
      const t = (points - lo.at) / (hi.at - lo.at);
      const rgb = lo.rgb.map((v, k) => Math.round(v + (hi.rgb[k] - v) * t));
      return `rgb(${rgb.join(', ')})`;
    }
  }
  return `rgb(${last.rgb.join(', ')})`;
}

/** 亮主显示的「花色」：无主时注明是用大王还是小王报的 */
function trumpOfDeclaration(decl: Declaration): string {
  if (decl.suit !== null) return SUIT_SYMBOL[decl.suit];
  return decl.strength === BidStrength.BigJokerPair
    ? '无主（大王）'
    : '无主（小王）';
}

/** 翻底定主的「花色」：翻到王时同样注明大小王 */
function trumpOfBottomFlip(suit: Suit | null, decisiveCard: Card | null): string {
  if (suit !== null) return SUIT_SYMBOL[suit];
  if (decisiveCard && decisiveCard.suit === Suit.Joker) {
    return decisiveCard.rank === Rank.BigJoker ? '无主（大王）' : '无主（小王）';
  }
  return '无主';
}

/** 「新的一局」对话框里的一行选项（等级下拉 / 复选开关共用同一套样式） */
const OPTION_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
};

/** 选项内的下拉框：与选项文字同字号、同色调 */
const OPTION_SELECT_STYLE: React.CSSProperties = {
  minWidth: 64,
  padding: '3px 6px',
  fontSize: 14,
  color: 'rgba(255,255,255,0.85)',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 6,
  cursor: 'pointer',
  accentColor: '#ffd700',
  // 下拉列表由系统绘制：必须声明深色调色板，否则默认白底 + 白字看不见
  colorScheme: 'dark',
};

/** 下拉列表项：深底白字（部分浏览器忽略 select 的 color，需要单独指定） */
const OPTION_ITEM_STYLE: React.CSSProperties = {
  color: '#f2f2f2',
  background: '#1e2b1e',
};

/** 选项内的补充说明（灰色小字） */
const OPTION_HINT_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.45)',
};

function App() {
  // ---- 游戏状态 ----
  const [hands, setHands] = useState<Hands | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [gameSpeed, setGameSpeed] = useState(3);
  const [playerModes, setPlayerModes] = useState<Record<PlayerPosition, PlayerMode>>({
    E: PlayerMode.Auto,
    S: PlayerMode.Manual,
    W: PlayerMode.Auto,
    N: PlayerMode.Manual,
  });
  const [visibility, setVisibility] = useState<Record<PlayerPosition, boolean>>({
    E: false,
    S: true,
    W: false,
    N: false,
  });

  // ---- 叫主状态 ----
  const [phase, setPhase] = useState<GamePhase>(GamePhase.BiddingTrump);
  const [bidState, setBidState] = useState<BidState>(createBidState(0));
  const [trumpSuit, setTrumpSuit] = useState<Suit | null>(null);
  const [banker, setBanker] = useState<PlayerPosition | null>(null);

  // ---- 发牌状态（逐张发牌） ----
  const fullHandsRef = useRef<Hands | null>(null);
  const bottomRef = useRef<Card[]>([]);
  /** 本次发牌的**原始**底牌（埋底后 bottomRef 会被覆盖，这里始终保留） */
  const originalBottomRef = useRef<Card[]>([]);
  const [revealed, setRevealed] = useState(0);
  /** 主牌是否由翻底牌确定（此时不可再反主） */
  const [bottomTrump, setBottomTrump] = useState(false);
  /** 叫主倒计时（秒） */
  const [bidSeconds, setBidSeconds] = useState(BID_WINDOW_SECONDS);
  /** 是否正在逐张翻底牌定主 */
  const [flipping, setFlipping] = useState(false);
  /** 翻底定主时翻到的「决定性」牌（用于无主时区分大王 / 小王） */
  const [flipTrumpCard, setFlipTrumpCard] = useState<Card | null>(null);
  /** 已翻开的底牌张数 */
  const [flipCount, setFlipCount] = useState(0);
  /** 翻底定主的翻牌记录（按翻开顺序） */
  const [flipLog, setFlipLog] = useState<Card[]>([]);
  /** 是否展开翻底记录 */
  const [showFlipLog, setShowFlipLog] = useState(false);
  /** 埋底后的底牌 */
  const [buriedCards, setBuriedCards] = useState<Card[]>([]);
  /** 出牌阶段状态 */
  const [playState, setPlayState] = useState<PlayState | null>(null);
  /** 撤销栈（玩家与托管的埋底 / 出牌都会压栈） */
  const [history, setHistory] = useState<UndoSnapshot[]>([]);
  /** 撤销后暂停托管：避免 AI 立即把刚撤销的动作重做一遍 */
  const [autoPaused, setAutoPaused] = useState(false);
  /** 「新的一局」确认框 */
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  /** 「原样发牌」确认框 */
  const [confirmRedeal, setConfirmRedeal] = useState(false);
  /** 「自定义规则」信息框（只读，说明「新的一局」里的可选规则） */
  const [showRules, setShowRules] = useState(false);
  /** 本局生效的可选规则 */
  const [rules, setRules] = useState<RuleOptions>(DEFAULT_RULE_OPTIONS);
  /** 「新的一局」对话框中待确认的规则 */
  const [draftRules, setDraftRules] = useState<RuleOptions>(DEFAULT_RULE_OPTIONS);
  /** 新游戏起始级牌（两队相同，默认为 2） */
  const [startLevel, setStartLevel] = useState<Rank>(Rank.Two);
  /** 「新的一局」对话框中待确认的起始级牌 */
  const [draftStartLevel, setDraftStartLevel] = useState<Rank>(Rank.Two);

  /** 两队各自的级牌（标准双升：本局打庄家队的级牌） */
  const [levels, setLevels] = useState<LevelBoard>(() => initialLevelBoard());
  /** 两队各自的周目数（升过 A 后 +1，从 1 开始） */
  const [laps, setLaps] = useState<LapBoard>(() => initialLapBoard());

  // 本局打的级牌 = **庄家队**的级牌（首局未定庄时按南家队；两队都从 2 打起）
  const levelRank = levels[teamOf(banker ?? PlayerPosition.South)];
  const gameDelay = (baseMs: number) =>
    Math.round(baseMs * SPEED_MULTIPLIERS[gameSpeed - 1]);
  // 用 ref 持有最新 bidState，避免闭包陷阱
  const bidStateRef = useRef(bidState);
  bidStateRef.current = bidState;

  // 用 ref 持有最新手牌 / 主牌，避免 AI 埋底时的闭包陷阱
  const handsRef = useRef<Hands | null>(null);
  handsRef.current = hands;
  const trumpSuitRef = useRef<Suit | null>(null);
  trumpSuitRef.current = trumpSuit;

  // 用 ref 持有最新出牌状态，避免 AI 出牌 / 收墩时的闭包陷阱
  const playStateRef = useRef<PlayState | null>(null);
  playStateRef.current = playState;

  // 用 ref 持有最新底牌，避免收墩结算抠底时的闭包陷阱
  const buriedCardsRef = useRef<Card[]>([]);
  buriedCardsRef.current = buriedCards;

  // 本局**预定庄家**（「下一局」预设）：在 dealRound 里**同步**写入，
  // 与 React 渲染时序无关，因此不可能出现「预设丢了 → 退化成东家」的情况。
  // null = 本局庄家由叫主（亮主者）决定（首局 / 新游戏）。
  const presetBankerRef = useRef<PlayerPosition | null>(null);

  /** 本局出牌记录（每局重建；下一局发牌时清空） */
  const logRef = useRef<RoundRecord | null>(null);
  /** 运行时 card.id → 稳定 ID（如 S5#0） */
  const cardIdMapRef = useRef<Map<string, string>>(new Map());
  /** 本局日志的 gameId（导出用） */
  const gameIdRef = useRef('');
  /** 出牌记录弹窗 */
  const [playLogOpen, setPlayLogOpen] = useState(false);
  const [playLogMode, setPlayLogMode] = useState<'plays' | 'full'>('plays');

  /** 记录一次动作前的状态（玩家 / 托管的埋底、出牌都记录） */
  function pushSnapshot(
    kind: 'bury' | 'play',
    manual: boolean,
    snapHands: Hands,
    snapPlayState: PlayState | null,
    snapPhase: GamePhase,
  ) {
    const rec = logRef.current;
    // 必须在 setHistory 之前取值：updater 是延迟执行的，届时日志已经写入了这一手
    const logTricks = rec?.tricks.length ?? 0;
    const logLastPlays = rec && rec.tricks.length > 0
      ? rec.tricks[rec.tricks.length - 1].plays.length
      : 0;
    setHistory(prev => [...prev, {
      kind,
      manual,
      hands: snapHands,
      playState: snapPlayState,
      phase: snapPhase,
      buriedCards: buriedCardsRef.current,
      bottom: bottomRef.current,
      logTricks,
      logLastPlays,
    }]);
  }

  // ---- 重新发牌 ----
  // presetBanker 非空时以它为庄家（用于「下一局」：庄家由升级规则预定，叫主只定主花色）；
  // 为空时庄家仍由叫主（亮主者）决定（用于首局 / 新游戏）。
  // keepDeal = true 时**不洗牌**，沿用上一次发好的手牌与底部（「原样发牌」）。
  function dealRound(presetBanker: PlayerPosition | null, keepDeal = false) {
    presetBankerRef.current = presetBanker;

    let nextHands: Hands;
    let nextBottom: Card[];
    if (keepDeal && fullHandsRef.current && originalBottomRef.current.length > 0) {
      nextHands = fullHandsRef.current;
      nextBottom = originalBottomRef.current;
    } else {
      const deck = createDecks();
      shuffleCards(deck);
      const result = dealCards(deck, BOTTOM_COUNT);
      nextHands = {
        E: result.hands.E,
        S: result.hands.S,
        W: result.hands.W,
        N: result.hands.N,
      };
      nextBottom = result.bottom;
      originalBottomRef.current = nextBottom;
    }

    // 保存完整发牌结果，稍后逐张揭示
    fullHandsRef.current = nextHands;
    bottomRef.current = nextBottom;

    // 本局日志：每次发牌重建（上一局的记录随之清空）
    cardIdMapRef.current = buildCardIdMap(nextHands, nextBottom);
    gameIdRef.current = `G-${Math.random().toString(36).slice(2, 10)}`;
    logRef.current = createRoundRecord({
      level: levels[teamOf(presetBanker ?? PlayerPosition.South)],
      playerModes: { ...playerModes },
      deal: {
        mode: keepDeal ? 'sameDeal' : 'shuffle',
        hands: {
          E: encodeCards(cardIdMapRef.current, nextHands.E),
          N: encodeCards(cardIdMapRef.current, nextHands.N),
          W: encodeCards(cardIdMapRef.current, nextHands.W),
          S: encodeCards(cardIdMapRef.current, nextHands.S),
        },
        bottom: encodeCards(cardIdMapRef.current, nextBottom),
      },
    });

    setHands({ E: [], S: [], W: [], N: [] });
    setRevealed(0);
    setSelectedIndices(new Set());
    setTrumpSuit(null);
    setBanker(presetBanker);
    setBottomTrump(false);
    setBidSeconds(BID_WINDOW_SECONDS);
    setFlipping(false);
    setFlipCount(0);
    setFlipLog([]);
    setFlipTrumpCard(null);
    setShowFlipLog(false);
    setBuriedCards([]);
    setPlayState(null);
    setHistory([]);
    setAutoPaused(false);
    setBidState(createBidState(0));
    setPhase(GamePhase.Dealing);
  }

  // ---- 新游戏：等级回到起始级牌（默认 2），周目重新从 1 开始，庄家由叫主决定 ----
  function startNewGame(level: Rank = startLevel) {
    setLevels(initialLevelBoard(level));
    setLaps(initialLapBoard());
    dealRound(null);
  }

  // ---- 原样发牌：牌序不变（手牌 / 底牌与刚才完全一致），清除报主记录重新发牌 ----
  // 等级与周目保持不变；庄家重新由亮主者决定（与首局一致）。
  function redealSameCards() {
    dealRound(null, true);
  }

  // ---- 逐张发牌动画 ----
  useEffect(() => {
    if (phase !== GamePhase.Dealing) return;
    const full = fullHandsRef.current;
    if (!full) return;

    const total = full.S.length;
    if (revealed >= total) {
      // 发牌结束 → 进入叫主
      setPhase(GamePhase.BiddingTrump);
      return;
    }

    const timer = setTimeout(() => {
      const next = Math.min(revealed + 1, total);
      setHands({
        E: full.E.slice(0, next),
        S: full.S.slice(0, next),
        W: full.W.slice(0, next),
        N: full.N.slice(0, next),
      });
      setRevealed(next);
    }, gameDelay(500));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealed]);

  // ---- 跟牌必出牌（自动选中，且不可取消） ----
  function currentForcedIndices(): Set<number> {
    const ps = playStateRef.current;
    const hs = handsRef.current;
    if (phase !== GamePhase.Playing || !ps || !hs) return new Set();
    if (ps.trick.complete) return new Set();
    if (playerModes[ps.turn] !== PlayerMode.Manual) return new Set();
    return forcedFollowIndicesOf(
      hs[ps.turn],
      ps.trick,
      trumpSuitRef.current,
      levelRank,
    );
  }

  // ---- 选中/取消 ----
  function toggleCard(index: number) {
    setSelectedIndices(prev => {
      const forced = currentForcedIndices();
      // 必出的牌始终算作已选，且点击不能取消
      const next = new Set(prev);
      for (const i of forced) next.add(i);
      if (next.has(index)) {
        if (forced.has(index)) return prev;
        next.delete(index);
      }
      else {
        // 埋底阶段：最多选择与底牌等量的牌
        if (phase === GamePhase.Burying && next.size >= BOTTOM_COUNT) return prev;
        // 出牌跟出阶段：最多选到首出张数
        if (phase === GamePhase.Playing) {
          const ps = playStateRef.current;
          if (ps && !isLeading(ps) && next.size >= ps.trick.leadCount) return prev;
        }
        next.add(index);
      }
      return next;
    });
  }

  // ---- 切换玩家模式 ----
  function toggleMode(pos: PlayerPosition) {
    setAutoPaused(false);
    setPlayerModes(prev => ({
      ...prev,
      [pos]: prev[pos] === PlayerMode.Manual ? PlayerMode.Auto : PlayerMode.Manual,
    }));
  }

  // ---- 切换牌面可见 ----
  function toggleVisibility(pos: PlayerPosition) {
    setVisibility(prev => ({
      ...prev,
      [pos]: !prev[pos],
    }));
  }

  // ---- 应用一次声明（南家点击 / AI 抢反） ----
  function applyDeclare(decl: Declaration) {
    const prev = bidStateRef.current;
    setBidState({ ...prev, current: decl, history: [...prev.history, decl] });
    // 报主所用的牌（仅用于写入出牌记录）
    const handNow = handsRef.current?.[decl.player] ?? [];
    const handFull = fullHandsRef.current?.[decl.player] ?? [];
    const byId = new Map<string, Card>();
    for (const card of [...handFull, ...handNow]) byId.set(card.id, card);
    const bidCards = decl.cardIds
      .map(id => byId.get(id))
      .filter((card): card is Card => card !== undefined);
    if (logRef.current) {
      logRef.current.trump = {
        suit: decl.suit,
        declaredBy: decl.player,
        strength: decl.strength as 1 | 2 | 3 | 4,
        cards: encodeCards(cardIdMapRef.current, bidCards),
        decidedBy: 'bid',
        atDealt: revealed * 4,
      };
    }
    if (phase === GamePhase.BiddingTrump) {
      setBidSeconds(seconds =>
        seconds < FIRST_BID_MIN_REMAINING_SECONDS
          ? FIRST_BID_MIN_REMAINING_SECONDS
          : seconds,
      );
    }
    setTrumpSuit(decl.suit);
    // 已有预定庄家（「下一局」预设）时，叫主只定主花色，**绝不动庄家**
    if (presetBankerRef.current === null) setBanker(decl.player);
  }

  // ---- 结束叫主 ----
  function finishBidding(state: BidState) {
    const presetBanker = presetBankerRef.current;
    if (state.current) {
      // 有人报主：以最终声明定主
      setTrumpSuit(state.current.suit);
      setBottomTrump(false);
      startBurying(presetBanker ?? state.current.player);
    }
    else {
      // 无人报主：逐张翻底牌定主（此后不可再反主）
      setFlipCount(0);
      setFlipping(true);
    }
  }

  // ---- 「不反主」：立即结束等待反主，以当前声明定主并进入埋底 ----
  function passBidding() {
    if (phase !== GamePhase.BiddingTrump) return;
    finishBidding(bidStateRef.current);
  }

  // ---- 进入埋底：庄家收走底牌（手牌 25 → 33），等待埋底 ----
  function startBurying(bankerPos: PlayerPosition) {
    setBanker(bankerPos);
    // 庄家确定后，本局级牌取庄家队的等级
    if (logRef.current) logRef.current.level = levels[teamOf(bankerPos)];
    setSelectedIndices(new Set());
    // 庄家收走 8 张底牌
    setHands(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [bankerPos]: [...prev[bankerPos], ...bottomRef.current],
      };
    });
    setPhase(GamePhase.Burying);
  }

  // ---- 执行埋底：埋入的牌成为新底牌，庄家手牌回到 25 张 ----
  function applyBury(bankerPos: PlayerPosition, buried: Card[]) {
    const buriedIds = new Set(buried.map(c => c.id));
    setHands(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [bankerPos]: prev[bankerPos].filter(c => !buriedIds.has(c.id)),
      };
    });
    bottomRef.current = buried;
    setBuriedCards(buried);
    if (logRef.current) {
      logRef.current.buried = {
        player: bankerPos,
        cards: encodeCards(cardIdMapRef.current, buried),
        points: countPoints(buried),
      };
    }
    setSelectedIndices(new Set());
    setAutoPaused(false);
    setPhase(GamePhase.Playing);
  }

  // ---- 手动庄家确认埋底 ----
  function confirmBury() {
    if (!banker || !hands) return;
    const flat = groupCardsForDisplay(hands[banker], trumpSuit, levelRank)
      .flatMap(g => g.cards);
    const buried = flat.filter((_, i) => selectedIndices.has(i));
    if (buried.length !== BOTTOM_COUNT) return;
    // 压入撤销点（埋底前的状态：庄家 33 张、底牌未变）
    pushSnapshot('bury', true, hands, playState, phase);
    applyBury(banker, buried);
  }

  // ---- 翻底牌动画：依次翻开，直到级牌或王 ----
  useEffect(() => {
    if (!flipping) return;
    const bottom = bottomRef.current;
    const dec = decisiveBottomIndex(bottom, levelRank);
    const stopAt = dec >= 0 ? dec + 1 : bottom.length;

    if (flipCount < stopAt) {
      const t = setTimeout(() => setFlipCount(c => c + 1), gameDelay(650));
      return () => clearTimeout(t);
    }

    // 翻完 → 记录翻牌顺序，无论有无级牌/王都等 3 秒再定主
    setFlipLog(bottom.slice(0, stopAt));
    const t = setTimeout(() => {
      const suit = determineTrumpFromBottom(bottom, levelRank);
      setTrumpSuit(suit);
      setBottomTrump(true);
      setFlipping(false);
      // 翻底定主：庄家仍取预定庄家（「下一局」），否则取东家
      const flipBanker = presetBankerRef.current ?? ALL_POSITIONS[0];
      const decisive = decisiveBottomIndex(bottom, levelRank);
      let trumpCard: Card | undefined = bottom[0];
      if (decisive >= 0) {
        trumpCard = bottom[decisive];
      }
      else {
        for (const card of bottom) {
          if (trumpCard === undefined || card.rank > trumpCard.rank) trumpCard = card;
        }
      }
      if (logRef.current) {
        logRef.current.trump = {
          suit,
          declaredBy: flipBanker,
          strength: null,
          cards: trumpCard
            ? encodeCards(cardIdMapRef.current, [trumpCard])
            : [],
          decidedBy: 'bottomFlip',
          atDealt: 100,
        };
      }
      setFlipTrumpCard(trumpCard ?? null);
      startBurying(flipBanker);
    }, gameDelay(3000));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipping, flipCount]);

  // ---- 叫主窗口：进入时重置倒计时 ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump) return;
    setBidSeconds(BID_WINDOW_SECONDS);
     
  }, [phase]);

  // ---- 叫主窗口：倒计时 tick ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump) return;
    if (bidSeconds <= 0) return;
    const t = setTimeout(() => setBidSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, bidSeconds]);

  // ---- 叫主窗口结束 → 定主 ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump) return;
    if (bidSeconds > 0) return;
    finishBidding(bidStateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bidSeconds]);

  // ---- 托管玩家：AI 自动报主 ----
  // 发牌阶段按「当前已翻开的牌」评估，牌每翻一张都会重新评估；
  // 叫主阶段每次当前声明变化后重新评估，因此可以连续出现「亮主 → 反主 → 无主」。
  useEffect(() => {
    if (phase !== GamePhase.Dealing && phase !== GamePhase.BiddingTrump) return;
    if (flipping) return;
    const hs = handsRef.current;
    if (!hs) return;

    const current = bidState.current;
    // 同花色补强（自保）始终允许；换门 / 改无主是否允许由规则决定
    let chosen: Declaration | null = null;
    for (const pos of ALL_POSITIONS) {
      if (playerModes[pos] !== PlayerMode.Auto) continue;
      const decl = aiChooseDeclare(hs[pos], levelRank, current, pos, rules);
      if (decl && canOverride(decl, current, rules)) {
        chosen = decl;
        break;
      }
    }
    if (!chosen) return;

    const decl = chosen;
    // 发牌期间：直接亮主。若用延迟，下一次翻牌的 effect 会清掉定时器，导致永远报不出来。
    if (phase === GamePhase.Dealing) {
      if (canOverride(decl, bidStateRef.current.current, rules)) applyDeclare(decl);
      return;
    }

    const timer = setTimeout(() => {
      // 延迟期间可能已有南家 / 其他 AI 叫了更高的主
      if (!canOverride(decl, bidStateRef.current.current, rules)) return;
      applyDeclare(decl);
    }, gameDelay(800));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bidState, playerModes, flipping, levelRank, hands, rules]);

  // ---- 托管庄家：AI 自动埋底 ----
  useEffect(() => {
    if (phase !== GamePhase.Burying) return;
    if (autoPaused) return;
    if (!banker) return;
    if (playerModes[banker] !== PlayerMode.Auto) return;

    const t = setTimeout(() => {
      const hs = handsRef.current;
      const hand = hs?.[banker];
      if (!hs || !hand) return;
      // 埋底分风格暂时固定为 0（正常）；后续再接入设置 UI
      const buried = aiChooseBury(
        hand,
        BOTTOM_COUNT,
        trumpSuitRef.current,
        levelRank,
        0,
        { partnerHand: hs[partnerOf(banker)] },
      );
      pushSnapshot('bury', false, hs, playStateRef.current, GamePhase.Burying);
      applyBury(banker, buried);
    }, gameDelay(900));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, banker, autoPaused]);

  // ---- 出牌阶段：进入后由庄家领出 ----
  useEffect(() => {
    if (phase !== GamePhase.Playing) return;
    if (playState) return;
    setPlayState(createPlayState(banker ?? PlayerPosition.South));
     
  }, [phase, playState, banker]);

  /** 把一次已生效的出牌写入日志（以 applyPlay 后的实际牌为准） */
  function recordAppliedPlay(before: PlayState, after: PlayState) {
    const record = logRef.current;
    if (!record) return;
    const play = after.trick.plays[after.trick.plays.length - 1];
    if (!play) return;
    appendPlay(
      record,
      play.player,
      play.cards,
      trumpSuitRef.current,
      levelRank,
      isLeading(before),
      after.trick.throwAttempt,
      cardIdMapRef.current,
    );
  }

  /** 局末：把抠底与升级结算写入日志 */
  function finalizeRoundLog(state: PlayState) {
    const record = logRef.current;
    if (!record) return;
    if (state.bottom) {
      record.bottom = {
        taken: state.bottom.taken,
        winner: state.bottom.winner,
        tractorLength: state.bottom.tractorLength,
        multiplier: state.bottom.multiplier,
        cardPoints: state.bottom.bottomCardPoints,
        points: state.bottom.points,
      };
    }
    const settlement = settleLevel(state.defendingPoints, state.banker, levels);
    record.result = {
      defendingPoints: state.defendingPoints,
      bankerPoints: state.bankerPoints,
      levelChange: {
        upgradingTeam: settlement.upgradingTeam,
        side: settlement.side,
        steps: settlement.steps,
        switchBanker: settlement.switchBanker,
      },
      fromLevel: settlement.fromLevel,
      toLevel: settlement.toLevel,
      lapsGained: settlement.lapsGained,
      nextBanker: settlement.nextBanker,
    };
  }

  // ---- 托管玩家：AI 自动出牌 ----
  useEffect(() => {
    if (phase !== GamePhase.Playing) return;
    if (autoPaused) return;
    const ps = playState;
    if (!ps || ps.trick.complete) return;
    if (playerModes[ps.turn] !== PlayerMode.Auto) return;

    const t = setTimeout(() => {
      const cur = playStateRef.current;
      const hs = handsRef.current;
      if (!cur || !hs || cur.trick.complete) return;
      if (playerModes[cur.turn] !== PlayerMode.Auto) return;
      const cards = aiChoosePlay(cur, hs, trumpSuitRef.current, levelRank);
      if (cards.length === 0) return;
      // 自检：托管出牌必须合法（规则回归的早期预警）
      const chk = validatePlay(cur, hs[cur.turn], cards, trumpSuitRef.current, levelRank);
      if (!chk.ok) {
        console.warn('[AI] 非法出牌：', chk.reason, cards);
      }
      pushSnapshot('play', false, hs, cur, GamePhase.Playing);
      const res = applyPlay(hs, cur, cur.turn, cards, trumpSuitRef.current, levelRank);
      recordAppliedPlay(cur, res.state);
      setHands(res.hands);
      setPlayState(res.state);
    }, gameDelay(800));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playState, playerModes, autoPaused]);

  // ---- 四家出满 → 收墩，赢家继续领出 ----
  useEffect(() => {
    if (phase !== GamePhase.Playing) return;
    if (!playState?.trick.complete) return;

    const t = setTimeout(() => {
      const cur = playStateRef.current;
      const hs = handsRef.current;
      if (!cur || !hs || !cur.trick.complete) return;
      const res = collectTrick(
        hs, cur, buriedCardsRef.current, trumpSuitRef.current, levelRank,
      );
      const collected = res.state.tricks[res.state.tricks.length - 1];
      if (logRef.current && collected?.winner) {
        closeLastTrick(
          logRef.current,
          collected.winner,
          collected.points,
          res.state.defendingPoints,
          res.state.bankerPoints,
        );
      }
      if (res.roundOver) finalizeRoundLog(res.state);
      setHands(res.hands);
      setPlayState(res.state);
      if (res.roundOver) setPhase(GamePhase.RoundEnd);
    }, gameDelay(1100));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playState]);

  // ---- 手动玩家确认出牌 ----
  function commitPlay() {
    if (!playState || !hands) return;
    const flat = groupCardsForDisplay(hands[playState.turn], trumpSuit, levelRank)
      .flatMap(g => g.cards);
    // 必出的牌与 UI 的自动选中一致：即使 state 里没有，也要计入本次出牌
    const chosen = new Set(selectedIndices);
    for (const i of forcedFollowIndicesOf(
      hands[playState.turn],
      playState.trick,
      trumpSuit,
      levelRank,
    )) {
      chosen.add(i);
    }
    const cards = flat.filter((_, i) => chosen.has(i));
    const v = validatePlay(playState, hands[playState.turn], cards, trumpSuit, levelRank);
    if (!v.ok) return;
    // 压入撤销点（玩家出牌前的状态）
    pushSnapshot('play', true, hands, playState, phase);
    const res = applyPlay(hands, playState, playState.turn, cards, trumpSuit, levelRank);
    recordAppliedPlay(playState, res.state);
    setHands(res.hands);
    setPlayState(res.state);
    setSelectedIndices(new Set());
    setAutoPaused(false);
  }

  // ---- 提示：让 AI 选出建议的牌并选中（不打出 / 不确认） ----
  /** 把一手牌（Card[]）映射为 UI 选中下标（与 groupCardsForDisplay 顺序一致） */
  function indicesOfCards(hand: Card[], cards: Card[]): Set<number> {
    const ids = new Set(cards.map(c => c.id));
    const flat = groupCardsForDisplay(hand, trumpSuit, levelRank)
      .flatMap(g => g.cards);
    const result = new Set<number>();
    flat.forEach((card, index) => {
      if (ids.has(card.id)) result.add(index);
    });
    return result;
  }

  /** 出牌提示：用与托管完全相同的 AI 决策，只选中不出牌 */
  function hintPlay() {
    if (!playState || !hands) return;
    if (playerModes[playState.turn] !== PlayerMode.Manual) return;
    if (playState.trick.complete) return;
    const cards = aiChoosePlay(playState, hands, trumpSuit, levelRank);
    if (cards.length === 0) return;
    setSelectedIndices(indicesOfCards(hands[playState.turn], cards));
  }

  /** 埋底提示：用与托管埋底相同的 AI 决策，只选中不确认 */
  function hintBury() {
    if (!banker || !hands) return;
    if (playerModes[banker] !== PlayerMode.Manual) return;
    const cards = aiChooseBury(
      hands[banker],
      BOTTOM_COUNT,
      trumpSuit,
      levelRank,
      0,
      { partnerHand: hands[partnerOf(banker)] },
    );
    if (cards.length !== BOTTOM_COUNT) return;
    setSelectedIndices(indicesOfCards(hands[banker], cards));
  }

  // ---- 撤销：优先回到「上一次玩家决策之前」；
  // 若本局还没有玩家决策（全托管），则只退一步（AI 动作），
  // 并在恢复点仍由托管行动时暂停托管，避免 AI 立即重做。
  function undo() {
    if (history.length === 0) return;
    let idx = history.length - 1;
    while (idx >= 0 && !history[idx].manual) idx--;
    if (idx < 0) idx = history.length - 1;
    const snap = history[idx];
    if (!snap) return;
    setHistory(prev => prev.slice(0, idx));
    setHands(snap.hands);
    setPlayState(snap.playState);
    setPhase(snap.phase);
    setBuriedCards(snap.buriedCards);
    bottomRef.current = snap.bottom;
    setSelectedIndices(new Set());
    if (logRef.current) {
      truncateRecord(
        logRef.current,
        snap.logTricks,
        snap.logLastPlays,
        snap.phase === GamePhase.Burying,
      );
    }

    const autoWouldAct = (
      snap.phase === GamePhase.Burying
      && banker !== null
      && playerModes[banker] === PlayerMode.Auto
    ) || (
      snap.phase === GamePhase.Playing
      && snap.playState !== null
      && playerModes[snap.playState.turn] === PlayerMode.Auto
    );
    setAutoPaused(autoWouldAct);
  }

  // ---- 离开 / 刷新页面时弹窗确认 ----
  // 浏览器只显示自带的通用提示文案（无法自定义内容）；
  // 需同时 preventDefault 并设置 returnValue，旧版浏览器只看 returnValue。
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // ---- 初始发牌 ----
  useMemo(() => {
    if (!hands) startNewGame();
  }, []);

  // ---- 渲染 ----
  if (!hands) return null;

  const isBidding = phase === GamePhase.BiddingTrump;
  const isDealing = phase === GamePhase.Dealing;
  const isBurying = phase === GamePhase.Burying;
  const isPlaying = phase === GamePhase.Playing;
  const isRoundEnd = phase === GamePhase.RoundEnd;

  // 本局等级结算（含周目：升过 A → 周目 +1、级牌从 2 重新开始并累加剩余级数）
  const levelSettlement = isRoundEnd && playState && banker
    ? settleLevel(playState.defendingPoints, banker, levels)
    : null;

  // ---- 下一局：应用升级结果（新级牌 / 新庄家 / 周目）后重新发牌 ----
  // 该局打「新庄家方」的级牌（两队等级可不同）。
  function startNextRound() {
    if (!levelSettlement) return;
    const team = levelSettlement.upgradingTeam;
    setLevels(prev => ({
      ...prev,
      [team]: levelSettlement.toLevel,
    }));
    if (levelSettlement.lapUp) {
      setLaps(prev => ({
        ...prev,
        [team]: prev[team] + levelSettlement.lapsGained,
      }));
    }
    dealRound(levelSettlement.nextBanker);
  }

  // ---- 出牌记录：展示 / 导出 ----
  function currentPlayLog() {
    return buildPlayLog({
      gameId: gameIdRef.current,
      rules,
      startLevel,
      record: logRef.current,
    });
  }

  function serializeLog(format: 'json' | 'jsonc'): string {
    return serializePlayLog(currentPlayLog(), format);
  }

  function exportLog(format: 'json' | 'jsonc') {
    const blob = new Blob([serializeLog(format)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${gameIdRef.current || 'shengji'}.${
      format === 'jsonc' ? 'jsonc' : 'json'
    }`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openPlayLog(mode: 'plays' | 'full') {
    setPlayLogMode(mode);
    setPlayLogOpen(true);
  }

  // 南家报主栏：发牌/叫主阶段显示（仅南家为手动时），窗口内始终可操作
  const southManual = playerModes[PlayerPosition.South] === PlayerMode.Manual;
  const showBar = southManual && (isDealing || (isBidding && !flipping));
  const barCanAct = !flipping && (isDealing || isBidding);

  // 埋底：显示庄家手牌（南家为庄家时即南家手牌）
  const bankerIsAuto = banker !== null && playerModes[banker] === PlayerMode.Auto;
  const buryingManualBanker = isBurying && banker !== null && !bankerIsAuto;
  const bottomOriginIds = buryingManualBanker
    ? new Set(bottomRef.current.map(card => card.id))
    : undefined;

  // 出牌时南家手牌留在底部，其他玩家在各自方位操作手牌
  const playingTurn = playState?.turn ?? null;
  const turnIsManual = isPlaying && playingTurn !== null
    && playerModes[playingTurn] === PlayerMode.Manual;

  const handForDisplay = hands.S;

  const canSelectHand = (
    (isBurying && banker === PlayerPosition.South && !bankerIsAuto)
    || (turnIsManual && playingTurn === PlayerPosition.South)
  );

  const canSelectPosition = (position: PlayerPosition) =>
    (buryingManualBanker && banker === position)
    || (turnIsManual && playingTurn === position);

  const buryFlat = isBurying
    ? groupCardsForDisplay(
      banker ? hands[banker] : [],
      trumpSuit,
      levelRank,
    ).flatMap(g => g.cards)
    : [];
  const selectedBuriedPoints = countPoints(
    buryFlat.filter((_, i) => selectedIndices.has(i)),
  );

  // 出牌：已选牌（含自动选中的必出牌）+ 合法性
  const playFlat = isPlaying
    ? groupCardsForDisplay(
      playState && playingTurn ? hands[playingTurn] : [],
      trumpSuit,
      levelRank,
    ).flatMap(g => g.cards)
    : [];
  const forcedPlayIndices = isPlaying && playState && turnIsManual
    && !playState.trick.complete
    ? forcedFollowIndicesOf(hands[playState.turn], playState.trick, trumpSuit, levelRank)
    : new Set<number>();
  const effectiveSelectedIndices = forcedPlayIndices.size === 0
    ? selectedIndices
    : new Set([...selectedIndices, ...forcedPlayIndices]);
  const selectedPlayCards = playFlat.filter((_, i) => effectiveSelectedIndices.has(i));
  const playValidation = isPlaying && playState
    ? validatePlay(playState, hands[playState.turn], selectedPlayCards, trumpSuit, levelRank)
    : null;
  const selectedCanBeatCurrent = playValidation?.ok && playState
    ? canBeatCurrentPlay(playState, selectedPlayCards, trumpSuit, levelRank)
    : null;
  /** 本墩当前最大者是否为自己的对家（打不过队友时不必红色警示） */
  const beatLeaderIsPartner = (() => {
    if (!playState) return false;
    const leader = currentTrickLeader(playState.trick, trumpSuit, levelRank);
    if (leader === null || leader === playState.turn) return false;
    return teamOf(leader) === teamOf(playState.turn);
  })();

  /** 是否有可撤销的玩家操作 */
  const canUndo = history.length > 0;
  /** 最近一次可撤销的操作类型（用于按钮提示） */
  const lastUndoKind = history[history.length - 1]?.kind ?? null;

  // 本局主牌颜色：无主用紫色（与牌面一致），其余按花色
  const trumpTextColor = trumpSuit === null
    ? TRUMP_TEXT_COLORS[Suit.Joker]
    : TRUMP_TEXT_COLORS[trumpSuit];

  function renderPlayBar(compact = false) {
    if (!turnIsManual || !playingTurn || !playState) return null;
    return (
      <PlayBar
        player={playingTurn}
        isLeading={isLeading(playState)}
        requiredCount={isLeading(playState) ? null : playState.trick.leadCount}
        selectedCount={effectiveSelectedIndices.size}
        reason={selectedPlayCards.length > 0 ? (playValidation?.reason ?? null) : null}
        onPlay={commitPlay}
        onClear={() => setSelectedIndices(new Set())}
        onHint={hintPlay}
        compact={compact}
        canBeatCurrent={selectedCanBeatCurrent}
        leaderIsPartner={beatLeaderIsPartner}
      />
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a5c2a 0%, #0d3b1a 100%)',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      // 整局界面禁止拖拽框选（手牌、牌桌、状态文字都不会被选中）
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      {/* ---- 顶部菜单栏 ---- */}
      <MenuBar onNewGame={() => {
        setDraftRules(rules);
        setDraftStartLevel(startLevel);
        setConfirmNewGame(true);
      }}
        onRedealSameCards={() => setConfirmRedeal(true)}
        onViewRules={() => setShowRules(true)}
        onViewPlayLog={() => openPlayLog('plays')}
      />

      {/* ---- 左上角：双方等级（打几 / 级牌） ---- */}
      <div style={{
        position: 'absolute',
        top: MENU_BAR_OFFSET,
        left: 12,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.32)',
        border: '1px solid rgba(255,255,255,0.14)',
        color: 'rgba(255,255,255,0.85)',
        fontSize: 16,
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 12,
          letterSpacing: 2,
          color: 'rgba(255,255,255,0.5)',
        }}>
          等级
        </div>
        {[Team.NS, Team.EW].map(team => {
          const isCurrent = banker !== null && teamOf(banker) === team;
          return (
            <div
              key={team}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                fontWeight: isCurrent ? 700 : 500,
              }}
            >
              <span style={{
                minWidth: 36,
                color: 'rgba(255,255,255,0.6)',
              }}>
                {TEAM_NAME_ZH[team]}
              </span>
              <span style={{
                color: isCurrent ? '#ffd700' : 'rgba(255,255,255,0.9)',
              }}>
                打 {RANK_NAME[levels[team]]}
              </span>
              <span
                title={`第 ${laps[team]} 周目`}
                style={{
                  fontSize: 12,
                  lineHeight: '16px',
                  padding: '0 5px',
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                {formatLap(laps[team])}周目
              </span>
              {isCurrent && (
                <span style={{
                  fontSize: 11,
                  lineHeight: '16px',
                  padding: '0 5px',
                  borderRadius: 3,
                  background: 'rgba(255,215,0,0.2)',
                  color: '#ffd700',
                }}>
                  本局
                </span>
              )}
            </div>
          );
        })}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 2,
          paddingTop: 5,
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}>
          <span style={{
            minWidth: 36,
            color: 'rgba(255,255,255,0.6)',
          }}>
            亮主
          </span>
          {bidState.current
            ? (
              <>
                <b style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap' }}>
                  {POSITION_NAME_ZH[bidState.current.player]}家
                </b>
                <b style={{
                  fontSize: 19,
                  lineHeight: 1.1,
                  color: trumpTextColor,
                }}>
                  {trumpOfDeclaration(bidState.current)}
                </b>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {bidState.current.cardIds.length} 张
                </span>
              </>
            )
            : bottomTrump
              ? (
                <>
                  <b style={{
                    fontSize: 19,
                    lineHeight: 1.1,
                    color: trumpTextColor,
                  }}>
                    {trumpOfBottomFlip(trumpSuit, flipTrumpCard)}
                  </b>
                  <span
                    onClick={() => setShowFlipLog(v => !v)}
                    title="点击查看翻底记录"
                    style={{
                      pointerEvents: 'auto',
                      fontSize: 11,
                      lineHeight: '16px',
                      padding: '0 5px',
                      borderRadius: 3,
                      color: '#90caf9',
                      background: 'rgba(144,202,249,0.15)',
                      cursor: 'pointer',
                    }}
                  >
                    翻底
                  </span>
                </>
              )
              : (
                <b style={{ fontSize: 19, lineHeight: 1.1, color: 'rgba(255,255,255,0.45)' }}>
                  未定
                </b>
              )}
        </div>

        {/* 庄家 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 36, color: 'rgba(255,255,255,0.6)' }}>
            庄家
          </span>
          <b style={{ color: banker ? '#7ee787' : 'rgba(255,255,255,0.45)' }}>
            {banker ? `${POSITION_NAME_ZH[banker]}家` : '—'}
          </b>
        </div>

        {/* 得分 / 逃分（出牌阶段起显示） */}
        {playState && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            marginTop: 2,
            paddingTop: 5,
            borderTop: '1px solid rgba(255,255,255,0.15)',
            fontSize: 14,
          }}>
            {/* 庄家逃分（次要）/ 闲家得分（重点：字号大、颜色随分值渐变） */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>庄家逃分</span>
              <b style={{
                fontSize: 16,
                lineHeight: 1.1,
                color: '#ffd700',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {playState.bankerPoints}
              </b>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>闲家得分</span>
              <b style={{
                fontSize: 26,
                lineHeight: 1.05,
                color: defendingScoreColor(playState.defendingPoints),
                fontVariantNumeric: 'tabular-nums',
                transition: 'color 0.3s',
              }}>
                {playState.defendingPoints}
              </b>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>/80</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- 顶部：北家 ---- */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 12,
      }}>
        <OpponentHand
          position={PlayerPosition.North}
          cards={hands.N}
          levelRank={levelRank}
          trumpSuit={trumpSuit}
          faceUp={visibility.N}
          showToggle={true}
          onToggleVisibility={() => toggleVisibility(PlayerPosition.North)}
          playerMode={playerModes[PlayerPosition.North]}
          onToggleMode={() => toggleMode(PlayerPosition.North)}
          sourceCardIds={buryingManualBanker && banker === PlayerPosition.North
            ? bottomOriginIds
            : undefined}
          selectedIndices={canSelectPosition(PlayerPosition.North)
            ? effectiveSelectedIndices
            : undefined}
          onToggleCard={canSelectPosition(PlayerPosition.North)
            ? toggleCard
            : undefined}
        />
        {playingTurn === PlayerPosition.North && (
          <div style={{ marginTop: 4 }}>
            {renderPlayBar()}
          </div>
        )}
      </div>

      {/* ---- 中部：西家 + 牌桌 + 东家 ---- */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 16px',
      }}>
        {/* 西家 */}
        <div style={{ justifySelf: 'start' }}>
          <OpponentHand
            position={PlayerPosition.West}
            cards={hands.W}
            levelRank={levelRank}
            trumpSuit={trumpSuit}
            faceUp={visibility.W}
            showToggle={true}
            onToggleVisibility={() => toggleVisibility(PlayerPosition.West)}
            playerMode={playerModes[PlayerPosition.West]}
            onToggleMode={() => toggleMode(PlayerPosition.West)}
            sourceCardIds={buryingManualBanker && banker === PlayerPosition.West
              ? bottomOriginIds
              : undefined}
            selectedIndices={canSelectPosition(PlayerPosition.West)
              ? effectiveSelectedIndices
              : undefined}
            onToggleCard={canSelectPosition(PlayerPosition.West)
              ? toggleCard
              : undefined}
          />
          {playingTurn === PlayerPosition.West && (
            <div style={{ marginTop: 8 }}>
              {renderPlayBar(true)}
            </div>
          )}
        </div>

        {/* 牌桌中心 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          {/* 游戏标题（出牌阶段让位给出牌区） */}
          {!isPlaying && !isRoundEnd && (
            <>
              <div style={{
                fontSize: 28,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 2,
                textShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}>
                升级
              </div>
              <div style={{
                fontSize: 17,
                color: 'rgba(255,255,255,0.55)',
              }}>
                拖拉机 · 80分
              </div>
            </>
          )}

          {/* 阶段提示：无边框（牌桌上方不再有框框） */}
          {(isDealing || isBidding || isBurying || autoPaused) && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              marginTop: 2,
              fontSize: 14,
              color: 'rgba(255,255,255,0.8)',
              textAlign: 'center',
              textShadow: '0 1px 4px rgba(0,0,0,0.55)',
            }}>
              {isDealing && (
                <div>
                  发牌中… 可抢亮
                  {bidState.current && (
                    <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                      · 当前主牌：{trumpOfDeclaration(bidState.current)}
                      （{POSITION_NAME_ZH[bidState.current.player]}）
                    </span>
                  )}
                </div>
              )}
              {isBidding && (
                <div>
                  {flipping
                    ? '翻底牌定主…'
                    : (
                      <>
                        叫主倒计时 <b style={{ color: '#ffd700' }}>{bidSeconds}</b> 秒
                        {bidState.current
                          ? (
                            <span style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 6 }}>
                              （当前 {POSITION_NAME_ZH[bidState.current.player]}家：
                              {trumpOfDeclaration(bidState.current)}
                              {' '}{bidState.current.suit === null
                                ? ''
                                : bidState.current.strength === BidStrength.Pair
                                  ? '反主'
                                  : '亮主'}）
                            </span>
                          )
                          : (
                            <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>暂无人亮主</span>
                          )}
                      </>
                    )}
                </div>
              )}
              {isBurying && (
                <div style={{ color: '#ffd700' }}>
                  {bankerIsAuto
                    ? autoPaused
                      ? '庄家托管（已暂停，点「继续托管」恢复）'
                      : '庄家托管，自动埋底中…'
                    : `请选 ${BOTTOM_COUNT} 张埋入底牌（已选 ${selectedIndices.size} 张）`}
                </div>
              )}
              {autoPaused && (
                <div style={{ color: '#ffd700' }}>
                  ⏸ 已撤销 · 托管已暂停
                </div>
              )}
            </div>
          )}

          {/* 出牌区（本墩四家出牌） */}
          {isPlaying && playState && (
            <TrickArea
              state={playState}
              trumpSuit={trumpSuit}
              levelRank={levelRank}
            />
          )}

          {/* 本局结束 · 结算（含抠底与升级） */}
          {isRoundEnd && playState && (
            <RoundSettlement
              trickCount={playState.tricks.length}
              defendingPoints={playState.defendingPoints}
              bankerPoints={playState.bankerPoints}
              bottom={playState.bottom}
              bottomCards={buriedCards}
              banker={banker}
              levels={levels}
              laps={laps}
              levelSettlement={levelSettlement}
              onViewPlayLog={() => openPlayLog('full')}
              onNextRound={startNextRound}
            />
          )}

          {/* 底牌查看（弹窗，仅南家为庄；桌中央留给出牌区） */}
          <BottomReveal
            cards={buriedCards}
            canReveal={banker === PlayerPosition.South}
          />

          {/* 翻底牌逐张展示 */}
          {flipping && (
            <div style={{
              display: 'flex',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,215,0,0.3)',
            }}>
              {bottomRef.current.slice(0, flipCount).map(c => (
                <CardComponent key={c.id} card={c} faceUp={true} small={true} />
              ))}
            </div>
          )}

          {/* 翻底记录（点击“翻底定主”展开） */}
          {showFlipLog && flipLog.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(144,202,249,0.4)',
            }}>
              {flipLog.map(c => (
                <CardComponent key={c.id} card={c} faceUp={true} small={true} />
              ))}
            </div>
          )}

          {/* 撤销 / 继续托管 */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            alignItems: 'stretch',
          }}>
            <button
              onClick={undo}
              disabled={!canUndo}
              title={canUndo
                ? `撤销${lastUndoKind === 'bury' ? '埋底' : '出牌'}（共 ${history.length} 步；撤销后托管暂停）`
                : '暂无可撤销的操作'}
              style={{
                padding: '10px 22px',
                fontSize: 17,
                cursor: canUndo ? 'pointer' : 'not-allowed',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 6,
                background: canUndo ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
                color: canUndo ? '#fff' : 'rgba(255,255,255,0.35)',
                fontWeight: 600,
              }}
            >
              ↩ 撤销{canUndo ? `（${history.length}）` : ''}
            </button>
            {autoPaused && (
              <button
                onClick={() => setAutoPaused(false)}
                title="恢复托管：让 AI 继续自动埋底 / 出牌"
                style={{
                  padding: '10px 22px',
                  fontSize: 17,
                  cursor: 'pointer',
                  border: '1px solid rgba(126,231,135,0.5)',
                  borderRadius: 6,
                  background: 'rgba(126,231,135,0.16)',
                  color: '#7ee787',
                  fontWeight: 600,
                }}
              >
                ▶ 继续托管
              </button>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            marginTop: 8,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 14,
          }}>
            <span style={{ marginRight: 3 }}>速度</span>
            {SPEED_MULTIPLIERS.map((_, index) => {
              const level = index + 1;
              const active = gameSpeed === level;
              return (
                <button
                  key={level}
                  onClick={() => setGameSpeed(level)}
                  aria-pressed={active}
                  title={`速度 ${level}${level === 3 ? '（当前默认）' : ''}`}
                  style={{
                    width: 28,
                    height: 28,
                    padding: 0,
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    border: `1px solid ${active ? '#ffd700' : 'rgba(255,255,255,0.25)'}`,
                    borderRadius: 5,
                    background: active ? 'rgba(255,215,0,0.24)' : 'rgba(255,255,255,0.08)',
                    color: active ? '#ffd700' : 'rgba(255,255,255,0.75)',
                  }}
                >
                  {level}
                </button>
              );
            })}
          </div>

        </div>

        {/* 东家 */}
        <div style={{ justifySelf: 'end' }}>
          <OpponentHand
            position={PlayerPosition.East}
            cards={hands.E}
            levelRank={levelRank}
            trumpSuit={trumpSuit}
            faceUp={visibility.E}
            showToggle={true}
            onToggleVisibility={() => toggleVisibility(PlayerPosition.East)}
            playerMode={playerModes[PlayerPosition.East]}
            onToggleMode={() => toggleMode(PlayerPosition.East)}
            sourceCardIds={buryingManualBanker && banker === PlayerPosition.East
              ? bottomOriginIds
              : undefined}
            selectedIndices={canSelectPosition(PlayerPosition.East)
              ? effectiveSelectedIndices
              : undefined}
            onToggleCard={canSelectPosition(PlayerPosition.East)
              ? toggleCard
              : undefined}
          />
          {playingTurn === PlayerPosition.East && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              {renderPlayBar(true)}
            </div>
          )}
        </div>
      </div>

      {/* ---- 底部：南家（玩家）/ 庄家埋底 ---- */}
      <div style={{
        padding: '4px 16px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.2))',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
          padding: '0 8px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.75)',
            }}>
              {isBurying && banker === PlayerPosition.South
                ? `庄家（${POSITION_NAME_ZH[banker]}家）埋底`
                : '南家（你）'}
            </span>
            <PlayerModeButton
              position={PlayerPosition.South}
              mode={playerModes[PlayerPosition.South]}
              onToggle={() => toggleMode(PlayerPosition.South)}
            />
          </div>
          <span style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.5)',
          }}>
            {handForDisplay.length} 张
          </span>
        </div>

        {/* 埋底控制栏 */}
        {isBurying && banker && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <BottomCards
              banker={banker}
              auto={bankerIsAuto}
              paused={autoPaused}
              selectedCount={selectedIndices.size}
              requiredCount={BOTTOM_COUNT}
              buriedPoints={selectedBuriedPoints}
              onConfirm={confirmBury}
              onClear={() => setSelectedIndices(new Set())}
              onHint={hintBury}
            />
          </div>
        )}

        {/* 出牌控制栏 */}
        {isPlaying && turnIsManual && playingTurn === PlayerPosition.South && playState && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            {renderPlayBar()}
          </div>
        )}

        {/* 南家报主栏（发牌/叫主阶段） */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
        }}>
          {!isBurying && showBar && (
            <BiddingBar
              player={PlayerPosition.South}
              hand={hands.S}
              levelRank={levelRank}
              current={bidState.current}
              canAct={barCanAct}
              rules={rules}
              onBid={applyDeclare}
              onPass={isBidding && !flipping && bidState.current !== null
                ? passBidding
                : undefined}
            />
          )}
          {/* 南家非手动时不显示报主栏：给出原因（否则容易以为「报主框消失了」） */}
          {!isBurying && !showBar && !southManual && (isDealing || isBidding) && (
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              padding: '6px 14px',
              border: '1px dashed rgba(255,255,255,0.28)',
              borderRadius: 9,
            }}>
              南家当前为托管，AI 将自动参与亮主
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}>
          {isBurying && bankerIsAuto ? (
            <div style={{
              padding: '28px 0',
              fontSize: 16,
              color: 'rgba(255,255,255,0.65)',
            }}>
              {autoPaused
                ? '⏸ 托管已暂停（点「继续托管」或把庄家切为手动）'
                : `🤖 ${banker ? `${POSITION_NAME_ZH[banker]}家` : ''}托管埋底中…`}
            </div>
          ) : (
            <PlayerHand
              groups={groupCardsForDisplay(handForDisplay, trumpSuit, levelRank)}
              trumpSuit={trumpSuit}
              levelRank={levelRank}
              selectedIndices={canSelectHand ? effectiveSelectedIndices : undefined}
              onToggleCard={canSelectHand ? toggleCard : undefined}
              sourceCardIds={buryingManualBanker && banker === PlayerPosition.South
                ? bottomOriginIds
                : undefined}
            />
          )}
        </div>
      </div>

      {/* 甩牌被拦：只告知出牌者「被拦了」，不透露是谁 / 哪些牌 / 对方持有什么 */}
      {isPlaying && playState?.trick.throwBlocked && (
        <div style={{
          position: 'fixed',
          top: MENU_BAR_OFFSET,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          padding: '8px 18px',
          borderRadius: 999,
          background: 'rgba(198,40,40,0.92)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 0.5,
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}>
          ⛔ 甩牌被拦了，已自动出小
        </div>
      )}

      {/* 出牌记录：菜单「查看」= 仅出牌；结算 = 完整日志 + 导出 */}
      <PlayLogDialog
        open={playLogOpen}
        mode={playLogMode}
        record={logRef.current}
        serialize={serializeLog}
        onExport={exportLog}
        onClose={() => setPlayLogOpen(false)}
      />

      {/* 自定义规则（只读）：说明「新的一局」里的可选规则 */}
      <ConfirmDialog
        open={showRules}
        title="自定义规则"
        description={"以下选项可在「游戏 → 新的一局」中设置，此处仅作说明（只读）。"}
        width={420}
        confirmLabel="知道了"
        hideCancel={true}
        onConfirm={() => setShowRules(false)}
        onCancel={() => setShowRules(false)}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {[{
            name: '初始等级',
            value: `打 ${RANK_NAME[startLevel]}`,
            desc: '新开一局时南北与东西双方都从这个级牌开始打，可选 2 – A，默认打 2。'
              + '只决定「新的一局」的起点，之后按升级结果继续。',
          }, {
            name: '允许反自己亮的主',
            value: rules.allowSelfOverride ? '开启' : '关闭',
            desc: '默认关闭：只能反别人亮的主。开启后可以用更强的报品压掉自己亮的主。'
              + '同一报品内的补强（单张 → 对子、对子 → 对王）始终允许，不受此开关影响。',
          }].map(item => (
            <div key={item.name}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'rgba(255,255,255,0.9)',
              }}>
                <span style={{ fontWeight: 700 }}>{item.name}</span>
                <span style={{
                  padding: '1px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#ffd700',
                  background: 'rgba(255,215,0,0.14)',
                  border: '1px solid rgba(255,215,0,0.4)',
                }}>
                  {item.value}
                </span>
              </div>
              <div style={{
                marginTop: 4,
                fontSize: 13,
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.55)',
              }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </ConfirmDialog>

      {/* 原样发牌确认框 */}
      <ConfirmDialog
        open={confirmRedeal}
        title="原样发牌？"
        description={'牌序不变：四家手牌与 8 张底牌和刚才完全一致，\n但会清除报主记录并重新发牌（庄家重新由亮主决定）。\n等级与周目保持不变。'}
        confirmLabel="原样发牌"
        cancelLabel="取消"
        danger={true}
        onConfirm={() => {
          setConfirmRedeal(false);
          redealSameCards();
        }}
        onCancel={() => setConfirmRedeal(false)}
      />

      {/* 新的一局确认框 */}
      <ConfirmDialog
        open={confirmNewGame}
        title="开始新的一局？"
        description={`当前这局的进度将全部清空：手牌、分数、等级都会重置，\n双方从打 ${RANK_NAME[draftStartLevel]} 重新开始。`}
        confirmLabel="开始新的一局"
        cancelLabel="取消"
        danger={true}
        onConfirm={() => {
          setConfirmNewGame(false);
          setRules(draftRules);
          setStartLevel(draftStartLevel);
          startNewGame(draftStartLevel);
        }}
        onCancel={() => setConfirmNewGame(false)}
      >
        <div style={{
          fontSize: 12,
          letterSpacing: 1,
          color: 'rgba(255,255,255,0.45)',
          marginBottom: 8,
        }}>
          规则选项
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <label style={OPTION_ROW_STYLE}>
            初始等级
            <select
              value={draftStartLevel}
              onChange={event => setDraftStartLevel(Number(event.target.value) as Rank)}
              style={OPTION_SELECT_STYLE}
            >
              {LEVEL_RANKS.map(rank => (
                <option key={rank} value={rank} style={OPTION_ITEM_STYLE}>
                  {RANK_NAME[rank]}
                </option>
              ))}
            </select>
            <span style={OPTION_HINT_STYLE}>默认 2</span>
          </label>

          <label style={OPTION_ROW_STYLE}>
            <input
              type="checkbox"
              checked={draftRules.allowSelfOverride}
              onChange={event => setDraftRules(prev => ({
                ...prev,
                allowSelfOverride: event.target.checked,
              }))}
              style={{
                width: 16,
                height: 16,
                margin: 0,
                accentColor: '#ffd700',
                cursor: 'pointer',
              }}
            />
            允许反自己亮的主
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}

export default App;
