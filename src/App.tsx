// ============================================================
// 根组件 — 游戏主面板
// ============================================================

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  type Card,
  PlayerPosition,
  POSITION_NAME_ZH,
  PlayerMode,
  GamePhase,
  Rank,
  Suit,
  ALL_POSITIONS,
  SUIT_SYMBOL,
  RANK_NAME,
} from './core/types.ts'
import { groupCardsForDisplay } from './core/card.ts'
import { createDecks, shuffleCards, dealCards } from './core/deck.ts'
import {
  type Declaration,
  type BidState,
  createBidState,
  declarationLabel,
  decisiveBottomIndex,
  determineTrumpFromBottom,
} from './core/bidding.ts'
import { aiChooseBury, countPoints } from './core/bury.ts'
import {
  type PlayState,
  aiChoosePlay,
  applyPlay,
  collectTrick,
  createPlayState,
  isLeading,
  validatePlay,
} from './core/play.ts'
import PlayerHand from './components/PlayerHand.tsx'
import OpponentHand from './components/OpponentHand.tsx'
import PlayerModeButton from './components/PlayerModeButton.tsx'
import BiddingBar from './components/BiddingBar.tsx'
import BottomCards from './components/BottomCards.tsx'
import BottomReveal from './components/BottomReveal.tsx'
import TrickArea from './components/TrickArea.tsx'
import PlayBar from './components/PlayBar.tsx'
import ScoreBoard from './components/ScoreBoard.tsx'
import CardComponent from './components/CardComponent.tsx'

type Hands = Record<PlayerPosition, Card[]>

/** 撤销快照：记录「玩家决策前」的完整状态 */
interface UndoSnapshot {
  /** 该快照对应的动作（用于按钮提示） */
  kind: 'bury' | 'play'
  hands: Hands
  playState: PlayState | null
  phase: GamePhase
  /** 埋底后的底牌 */
  buriedCards: Card[]
  /** bottomRef 的值（原始底牌 / 已埋底牌） */
  bottom: Card[]
}

/** 发牌结束后的叫主窗口时长（秒） */
const BID_WINDOW_SECONDS = 8

/** 底牌张数（= 庄家埋底张数） */
const BOTTOM_COUNT = 8
const SPEED_MULTIPLIERS = [2, 1.5, 1, 0.75, 0.5] as const

function App() {
  // ---- 游戏状态 ----
  const [hands, setHands] = useState<Hands | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [gameSpeed, setGameSpeed] = useState(3)
  const [playerModes, setPlayerModes] = useState<Record<PlayerPosition, PlayerMode>>({
    E: PlayerMode.Auto,
    S: PlayerMode.Manual,
    W: PlayerMode.Auto,
    N: PlayerMode.Manual,
  })
  const [visibility, setVisibility] = useState<Record<PlayerPosition, boolean>>({
    E: false,
    S: true,
    W: false,
    N: false,
  })

  // ---- 叫主状态 ----
  const [phase, setPhase] = useState<GamePhase>(GamePhase.BiddingTrump)
  const [bidState, setBidState] = useState<BidState>(createBidState(0))
  const [trumpSuit, setTrumpSuit] = useState<Suit | null>(null)
  const [banker, setBanker] = useState<PlayerPosition | null>(null)

  // ---- 发牌状态（逐张发牌） ----
  const fullHandsRef = useRef<Hands | null>(null)
  const bottomRef = useRef<Card[]>([])
  const [revealed, setRevealed] = useState(0)
  /** 主牌是否由翻底牌确定（此时不可再反主） */
  const [bottomTrump, setBottomTrump] = useState(false)
  /** 叫主倒计时（秒） */
  const [bidSeconds, setBidSeconds] = useState(BID_WINDOW_SECONDS)
  /** 是否正在逐张翻底牌定主 */
  const [flipping, setFlipping] = useState(false)
  /** 已翻开的底牌张数 */
  const [flipCount, setFlipCount] = useState(0)
  /** 翻底定主的翻牌记录（按翻开顺序） */
  const [flipLog, setFlipLog] = useState<Card[]>([])
  /** 是否展开翻底记录 */
  const [showFlipLog, setShowFlipLog] = useState(false)
  /** 埋底后的底牌 */
  const [buriedCards, setBuriedCards] = useState<Card[]>([])
  /** 出牌阶段状态 */
  const [playState, setPlayState] = useState<PlayState | null>(null)
  /** 撤销栈（仅记录「玩家」出牌前的状态；托管出牌不压栈） */
  const [history, setHistory] = useState<UndoSnapshot[]>([])

  const levelRank = Rank.Two
  const gameDelay = (baseMs: number) =>
    Math.round(baseMs * SPEED_MULTIPLIERS[gameSpeed - 1])

  // 用 ref 持有最新 bidState，避免闭包陷阱
  const bidStateRef = useRef(bidState)
  bidStateRef.current = bidState

  // 用 ref 持有最新手牌 / 主牌，避免 AI 埋底时的闭包陷阱
  const handsRef = useRef<Hands | null>(null)
  handsRef.current = hands
  const trumpSuitRef = useRef<Suit | null>(null)
  trumpSuitRef.current = trumpSuit

  // 用 ref 持有最新出牌状态，避免 AI 出牌 / 收墩时的闭包陷阱
  const playStateRef = useRef<PlayState | null>(null)
  playStateRef.current = playState

  // ---- 新一局 ----
  function startNewGame() {
    const deck = createDecks()
    shuffleCards(deck)
    const result = dealCards(deck, BOTTOM_COUNT)

    // 保存完整发牌结果，稍后逐张揭示
    fullHandsRef.current = {
      E: result.hands.E,
      S: result.hands.S,
      W: result.hands.W,
      N: result.hands.N,
    }
    bottomRef.current = result.bottom

    setHands({ E: [], S: [], W: [], N: [] })
    setRevealed(0)
    setSelectedIndices(new Set())
    setTrumpSuit(null)
    setBanker(null)
    setBottomTrump(false)
    setBidSeconds(BID_WINDOW_SECONDS)
    setFlipping(false)
    setFlipCount(0)
    setFlipLog([])
    setShowFlipLog(false)
    setBuriedCards([])
    setPlayState(null)
    setHistory([])
    setBidState(createBidState(0))
    setPhase(GamePhase.Dealing)
  }

  // ---- 逐张发牌动画 ----
  useEffect(() => {
    if (phase !== GamePhase.Dealing) return
    const full = fullHandsRef.current
    if (!full) return

    const total = full.S.length
    if (revealed >= total) {
      // 发牌结束 → 进入叫主
      setPhase(GamePhase.BiddingTrump)
      return
    }

    const timer = setTimeout(() => {
      const next = Math.min(revealed + 1, total)
      setHands({
        E: full.E.slice(0, next),
        S: full.S.slice(0, next),
        W: full.W.slice(0, next),
        N: full.N.slice(0, next),
      })
      setRevealed(next)
    }, gameDelay(500))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealed])

  // ---- 选中/取消 ----
  function toggleCard(index: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      }
      else {
        // 埋底阶段：最多选择与底牌等量的牌
        if (phase === GamePhase.Burying && next.size >= BOTTOM_COUNT) return prev
        // 出牌跟出阶段：最多选到首出张数
        if (phase === GamePhase.Playing) {
          const ps = playStateRef.current
          if (ps && !isLeading(ps) && next.size >= ps.trick.leadCount) return prev
        }
        next.add(index)
      }
      return next
    })
  }

  // ---- 切换玩家模式 ----
  function toggleMode(pos: PlayerPosition) {
    setPlayerModes(prev => ({
      ...prev,
      [pos]: prev[pos] === PlayerMode.Manual ? PlayerMode.Auto : PlayerMode.Manual,
    }))
  }

  // ---- 切换牌面可见 ----
  function toggleVisibility(pos: PlayerPosition) {
    setVisibility(prev => ({
      ...prev,
      [pos]: !prev[pos],
    }))
  }

  // ---- 应用一次声明（南家点击 / AI 抢反） ----
  function applyDeclare(decl: Declaration) {
    const prev = bidStateRef.current
    setBidState({ ...prev, current: decl, history: [...prev.history, decl] })
    setTrumpSuit(decl.suit)
    setBanker(decl.player)
  }

  // ---- 结束叫主 ----
  function finishBidding(state: BidState) {
    if (state.current) {
      // 有人报主：以最终声明定主
      setTrumpSuit(state.current.suit)
      setBottomTrump(false)
      startBurying(state.current.player)
    }
    else {
      // 无人报主：逐张翻底牌定主（此后不可再反主）
      setFlipCount(0)
      setFlipping(true)
    }
  }

  // ---- 进入埋底：庄家收走底牌（手牌 25 → 33），等待埋底 ----
  function startBurying(bankerPos: PlayerPosition) {
    setBanker(bankerPos)
    setSelectedIndices(new Set())
    // 庄家收走 8 张底牌
    setHands(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [bankerPos]: [...prev[bankerPos], ...bottomRef.current],
      }
    })
    setPhase(GamePhase.Burying)
  }

  // ---- 执行埋底：埋入的牌成为新底牌，庄家手牌回到 25 张 ----
  function applyBury(bankerPos: PlayerPosition, buried: Card[]) {
    const buriedIds = new Set(buried.map(c => c.id))
    setHands(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [bankerPos]: prev[bankerPos].filter(c => !buriedIds.has(c.id)),
      }
    })
    bottomRef.current = buried
    setBuriedCards(buried)
    setSelectedIndices(new Set())
    setPhase(GamePhase.Playing)
  }

  // ---- 手动庄家确认埋底 ----
  function confirmBury() {
    if (!banker || !hands) return
    const flat = groupCardsForDisplay(hands[banker], trumpSuit, levelRank)
      .flatMap(g => g.cards)
    const buried = flat.filter((_, i) => selectedIndices.has(i))
    if (buried.length !== BOTTOM_COUNT) return
    // 压入撤销点（埋底前的状态：庄家 33 张、底牌未变）
    setHistory(prev => [...prev, {
      kind: 'bury',
      hands,
      playState,
      phase,
      buriedCards,
      bottom: bottomRef.current,
    }])
    applyBury(banker, buried)
  }

  // ---- 翻底牌动画：依次翻开，直到级牌或王 ----
  useEffect(() => {
    if (!flipping) return
    const bottom = bottomRef.current
    const dec = decisiveBottomIndex(bottom, levelRank)
    const stopAt = dec >= 0 ? dec + 1 : bottom.length

    if (flipCount < stopAt) {
      const t = setTimeout(() => setFlipCount(c => c + 1), gameDelay(650))
      return () => clearTimeout(t)
    }

    // 翻完 → 记录翻牌顺序，无论有无级牌/王都等 3 秒再定主
    setFlipLog(bottom.slice(0, stopAt))
    const t = setTimeout(() => {
      const suit = determineTrumpFromBottom(bottom, levelRank)
      setTrumpSuit(suit)
      setBottomTrump(true)
      setFlipping(false)
      startBurying(ALL_POSITIONS[0])
    }, gameDelay(3000))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipping, flipCount])

  // ---- 叫主窗口：进入时重置倒计时 ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump) return
    setBidSeconds(BID_WINDOW_SECONDS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ---- 叫主窗口：倒计时 tick ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump) return
    if (bidSeconds <= 0) return
    const t = setTimeout(() => setBidSeconds(s => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(t)
  }, [phase, bidSeconds])

  // ---- 叫主窗口结束 → 定主 ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump) return
    if (bidSeconds > 0) return
    finishBidding(bidStateRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bidSeconds])

  // ---- 托管庄家：AI 自动埋底 ----
  useEffect(() => {
    if (phase !== GamePhase.Burying) return
    if (!banker) return
    if (playerModes[banker] !== PlayerMode.Auto) return

    const t = setTimeout(() => {
      const hand = handsRef.current?.[banker]
      if (!hand) return
      const buried = aiChooseBury(hand, BOTTOM_COUNT, trumpSuitRef.current, levelRank)
      applyBury(banker, buried)
    }, gameDelay(900))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, banker])

  // ---- 出牌阶段：进入后由庄家领出 ----
  useEffect(() => {
    if (phase !== GamePhase.Playing) return
    if (playState) return
    setPlayState(createPlayState(banker ?? PlayerPosition.South))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playState, banker])

  // ---- 托管玩家：AI 自动出牌 ----
  useEffect(() => {
    if (phase !== GamePhase.Playing) return
    const ps = playState
    if (!ps || ps.trick.complete) return
    if (playerModes[ps.turn] !== PlayerMode.Auto) return

    const t = setTimeout(() => {
      const cur = playStateRef.current
      const hs = handsRef.current
      if (!cur || !hs || cur.trick.complete) return
      if (playerModes[cur.turn] !== PlayerMode.Auto) return
      const cards = aiChoosePlay(cur, hs[cur.turn], trumpSuitRef.current, levelRank)
      if (cards.length === 0) return
      // 自检：托管出牌必须合法（规则回归的早期预警）
      const chk = validatePlay(cur, hs[cur.turn], cards, trumpSuitRef.current, levelRank)
      if (!chk.ok) {
        console.warn('[AI] 非法出牌：', chk.reason, cards)
      }
      const res = applyPlay(hs, cur, cur.turn, cards, trumpSuitRef.current, levelRank)
      setHands(res.hands)
      setPlayState(res.state)
    }, gameDelay(800))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playState, playerModes])

  // ---- 四家出满 → 收墩，赢家继续领出 ----
  useEffect(() => {
    if (phase !== GamePhase.Playing) return
    if (!playState?.trick.complete) return

    const t = setTimeout(() => {
      const cur = playStateRef.current
      const hs = handsRef.current
      if (!cur || !hs || !cur.trick.complete) return
      const res = collectTrick(hs, cur)
      setHands(res.hands)
      setPlayState(res.state)
      if (res.roundOver) setPhase(GamePhase.RoundEnd)
    }, gameDelay(1100))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playState])

  // ---- 手动玩家确认出牌 ----
  function commitPlay() {
    if (!playState || !hands) return
    const flat = groupCardsForDisplay(hands[playState.turn], trumpSuit, levelRank)
      .flatMap(g => g.cards)
    const cards = flat.filter((_, i) => selectedIndices.has(i))
    const v = validatePlay(playState, hands[playState.turn], cards, trumpSuit, levelRank)
    if (!v.ok) return
    // 压入撤销点（玩家出牌前的状态）
    setHistory(prev => [...prev, {
      kind: 'play',
      hands,
      playState,
      phase,
      buriedCards,
      bottom: bottomRef.current,
    }])
    const res = applyPlay(hands, playState, playState.turn, cards, trumpSuit, levelRank)
    setHands(res.hands)
    setPlayState(res.state)
    setSelectedIndices(new Set())
  }

  // ---- 撤销：回到「上一次玩家决策之前」（埋底 / 出牌均适用）
  // 快照之后的所有托管出牌（含收墩、甚至结束本局）一并回退，
  // 恢复后轮到的是原手动玩家（或回到埋底阶段），因此不会出现 AI 「秒回」。
  function undo() {
    const snap = history[history.length - 1]
    if (!snap) return
    setHistory(prev => prev.slice(0, -1))
    setHands(snap.hands)
    setPlayState(snap.playState)
    setPhase(snap.phase)
    setBuriedCards(snap.buriedCards)
    bottomRef.current = snap.bottom
    setSelectedIndices(new Set())
  }

  // ---- 初始发牌 ----
  useMemo(() => {
    if (!hands) startNewGame()
  }, [])

  // ---- 渲染 ----
  if (!hands) return null

  const isBidding = phase === GamePhase.BiddingTrump
  const isDealing = phase === GamePhase.Dealing
  const isBurying = phase === GamePhase.Burying
  const isPlaying = phase === GamePhase.Playing
  const isRoundEnd = phase === GamePhase.RoundEnd

  // 南家报主栏：发牌/叫主阶段显示（仅南家为手动时），窗口内始终可操作
  const southManual = playerModes[PlayerPosition.South] === PlayerMode.Manual
  const showBar = southManual && (isDealing || (isBidding && !flipping))
  const barCanAct = !flipping && (isDealing || isBidding)

  // 埋底：显示庄家手牌（南家为庄家时即南家手牌）
  const bankerIsAuto = banker !== null && playerModes[banker] === PlayerMode.Auto
  const buryingManualBanker = isBurying && banker !== null && !bankerIsAuto

  // 出牌时南家手牌留在底部，其他玩家在各自方位操作手牌
  const playingTurn = playState?.turn ?? null
  const turnIsManual = isPlaying && playingTurn !== null
    && playerModes[playingTurn] === PlayerMode.Manual

  const handForDisplay = hands.S

  const canSelectHand = (
    (isBurying && banker === PlayerPosition.South && !bankerIsAuto)
    || (turnIsManual && playingTurn === PlayerPosition.South)
  )

  const canSelectPosition = (position: PlayerPosition) =>
    (buryingManualBanker && banker === position)
    || (turnIsManual && playingTurn === position)

  const buryFlat = isBurying
    ? groupCardsForDisplay(
      banker ? hands[banker] : [],
      trumpSuit,
      levelRank,
    ).flatMap(g => g.cards)
    : []
  const selectedBuriedPoints = countPoints(
    buryFlat.filter((_, i) => selectedIndices.has(i)),
  )

  // 出牌：已选牌 + 合法性
  const playFlat = isPlaying
    ? groupCardsForDisplay(
      playState && playingTurn ? hands[playingTurn] : [],
      trumpSuit,
      levelRank,
    ).flatMap(g => g.cards)
    : []
  const selectedPlayCards = playFlat.filter((_, i) => selectedIndices.has(i))
  const playValidation = isPlaying && playState
    ? validatePlay(playState, hands[playState.turn], selectedPlayCards, trumpSuit, levelRank)
    : null

  /** 是否有可撤销的玩家操作 */
  const canUndo = history.length > 0
  /** 最近一次可撤销的操作类型（用于按钮提示） */
  const lastUndoKind = history[history.length - 1]?.kind ?? null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a5c2a 0%, #0d3b1a 100%)',
      overflow: 'hidden',
      fontFamily: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    }}>
      {/* ---- 顶部：北家 ---- */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 12,
        position: 'relative',
      }}>
        <OpponentHand
          position={PlayerPosition.North}
          cards={hands.N}
          levelRank={levelRank}
          trumpSuit={trumpSuit}
          faceUp={visibility.N}
          showToggle
          onToggleVisibility={() => toggleVisibility(PlayerPosition.North)}
          playerMode={playerModes[PlayerPosition.North]}
          onToggleMode={() => toggleMode(PlayerPosition.North)}
          selectedIndices={canSelectPosition(PlayerPosition.North)
            ? selectedIndices
            : undefined}
          onToggleCard={canSelectPosition(PlayerPosition.North)
            ? toggleCard
            : undefined}
        />
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
            showToggle
            onToggleVisibility={() => toggleVisibility(PlayerPosition.West)}
            playerMode={playerModes[PlayerPosition.West]}
            onToggleMode={() => toggleMode(PlayerPosition.West)}
            selectedIndices={canSelectPosition(PlayerPosition.West)
              ? selectedIndices
              : undefined}
            onToggleCard={canSelectPosition(PlayerPosition.West)
              ? toggleCard
              : undefined}
          />
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

          {/* 叫主状态 / 结果 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            marginTop: 4,
            padding: '8px 18px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
              打 <b style={{ color: '#ffd700' }}>{RANK_NAME[levelRank]}</b>
            </div>
            {isDealing && (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                发牌中… 可抢亮
              </div>
            )}
            {isBidding && (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                {flipping
                  ? '翻底牌定主…'
                  : (
                    <>
                      叫主倒计时 <b style={{ color: '#ffd700' }}>{bidSeconds}</b> 秒
                      {bidState.current
                        ? (
                          <span style={{ color: '#7ee787', marginLeft: 6 }}>
                            （当前 {POSITION_NAME_ZH[bidState.current.player]}家 {declarationLabel(bidState.current)}）
                          </span>
                        )
                        : (
                          <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>暂无人亮主</span>
                        )}
                    </>
                  )}
              </div>
            )}
            {!isDealing && !isBidding && (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                主牌：<b style={{ color: '#ffd700' }}>
                  {trumpSuit ? `主 ${SUIT_SYMBOL[trumpSuit]}` : '无主'}
                </b>
                {bottomTrump && (
                  <span
                    onClick={() => setShowFlipLog(v => !v)}
                    title="点击查看翻底记录"
                    style={{
                      color: '#90caf9',
                      marginLeft: 6,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: '0 5px',
                      borderRadius: 3,
                      background: 'rgba(144,202,249,0.15)',
                    }}
                  >
                    翻底定主
                  </span>
                )}
                {' · '}
                庄家：<b style={{ color: '#7ee787' }}>
                  {banker ? `${POSITION_NAME_ZH[banker]}家` : '—'}
                </b>
              </div>
            )}
            {isBurying && (
              <div style={{ fontSize: 13, color: '#ffd700' }}>
                {bankerIsAuto
                  ? '庄家托管，自动埋底中…'
                  : `请选 ${BOTTOM_COUNT} 张埋入底牌（已选 ${selectedIndices.size} 张）`}
              </div>
            )}
            {isPlaying && playState && (
              <div style={{ fontSize: 13, color: '#ffd700' }}>
                轮到 {POSITION_NAME_ZH[playState.turn]}家
                （{playerModes[playState.turn] === PlayerMode.Manual ? '手动' : '托管'}）
              </div>
            )}
          </div>

          {/* 计分板（闲家得分 / 庄家逃分） */}
          {playState && (
            <ScoreBoard
              defendingPoints={playState.defendingPoints}
              bankerPoints={playState.bankerPoints}
            />
          )}

          {/* 出牌区（本墩四家出牌） */}
          {isPlaying && playState && (
            <TrickArea state={playState} />
          )}

          {/* 本局结束 */}
          {isRoundEnd && (
            <div style={{ fontSize: 15, color: '#ffd700' }}>
              本局结束 · 共 {playState?.tricks.length ?? 0} 墩
            </div>
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
                <CardComponent key={c.id} card={c} faceUp small />
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
                <CardComponent key={c.id} card={c} faceUp small />
              ))}
            </div>
          )}

          {/* 新游戏 / 撤销 */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            alignItems: 'stretch',
          }}>
            <button
              onClick={startNewGame}
              style={{
                padding: '10px 32px',
                fontSize: 18,
                cursor: 'pointer',
                border: 'none',
                borderRadius: 6,
                background: 'linear-gradient(135deg, #ffd700, #ffb300)',
                color: '#1a1a1a',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(255,215,0,0.3)',
              }}
            >
              新的一局
            </button>
            <button
              onClick={undo}
              disabled={!canUndo}
              title={canUndo
                ? `撤销${lastUndoKind === 'bury' ? '埋底' : '出牌'}（共 ${history.length} 步）`
                : '暂无可撤销的玩家操作'}
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
              const level = index + 1
              const active = gameSpeed === level
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
              )
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
            showToggle
            onToggleVisibility={() => toggleVisibility(PlayerPosition.East)}
            playerMode={playerModes[PlayerPosition.East]}
            onToggleMode={() => toggleMode(PlayerPosition.East)}
            selectedIndices={canSelectPosition(PlayerPosition.East)
              ? selectedIndices
              : undefined}
            onToggleCard={canSelectPosition(PlayerPosition.East)
              ? toggleCard
              : undefined}
          />
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
              selectedCount={selectedIndices.size}
              requiredCount={BOTTOM_COUNT}
              buriedPoints={selectedBuriedPoints}
              onConfirm={confirmBury}
              onClear={() => setSelectedIndices(new Set())}
            />
          </div>
        )}

        {/* 出牌控制栏 */}
        {isPlaying && turnIsManual && playingTurn && playState && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <PlayBar
              player={playingTurn}
              isLeading={isLeading(playState)}
              requiredCount={isLeading(playState) ? null : playState.trick.leadCount}
              selectedCount={selectedIndices.size}
              reason={selectedPlayCards.length > 0 ? (playValidation?.reason ?? null) : null}
              onPlay={commitPlay}
              onClear={() => setSelectedIndices(new Set())}
            />
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
              onBid={applyDeclare}
            />
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
        }}>
          {isBurying && bankerIsAuto ? (
            <div style={{
              padding: '28px 0',
              fontSize: 16,
              color: 'rgba(255,255,255,0.65)',
            }}>
              🤖 {banker ? `${POSITION_NAME_ZH[banker]}家` : ''}托管埋底中…
            </div>
          ) : (
            <PlayerHand
              groups={groupCardsForDisplay(handForDisplay, trumpSuit, levelRank)}
              selectedIndices={canSelectHand ? selectedIndices : undefined}
              onToggleCard={canSelectHand ? toggleCard : undefined}
            />
          )}
        </div>
      </div>

      {/* 甩牌被拦：只告知出牌者「被拦了」，不透露是谁 / 哪些牌 / 对方持有什么 */}
      {isPlaying && playState?.trick.throwBlocked && (
        <div style={{
          position: 'fixed',
          top: 14,
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
    </div>
  )
}

export default App
