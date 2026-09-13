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
import { sortCards, groupCardsForDisplay } from './core/card.ts'
import { createDecks, shuffleCards, dealCards } from './core/deck.ts'
import {
  type Declaration,
  type BidState,
  createBidState,
  getPossibleDeclarations,
  canOverride,
  aiChooseDeclare,
  declarationLabel,
} from './core/bidding.ts'
import PlayerHand from './components/PlayerHand.tsx'
import OpponentHand from './components/OpponentHand.tsx'
import TrumpBidder from './components/TrumpBidder.tsx'

type Hands = Record<PlayerPosition, Card[]>

function App() {
  // ---- 游戏状态 ----
  const [hands, setHands] = useState<Hands | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
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

  const levelRank = Rank.Two

  // 用 ref 持有最新 bidState，避免闭包陷阱
  const bidStateRef = useRef(bidState)
  bidStateRef.current = bidState

  // ---- 新一局 ----
  function startNewGame() {
    const deck = createDecks()
    shuffleCards(deck)
    const result = dealCards(deck, 8)

    const sorted: Hands = {
      E: sortCards(result.hands.E, null, levelRank),
      S: sortCards(result.hands.S, null, levelRank),
      W: sortCards(result.hands.W, null, levelRank),
      N: sortCards(result.hands.N, null, levelRank),
    }

    setHands(sorted)
    setSelectedIndices(new Set())
    setTrumpSuit(null)
    setBanker(null)
    setBidState(createBidState(0))
    setPhase(GamePhase.BiddingTrump)
  }

  // ---- 选中/取消 ----
  function toggleCard(index: number) {
    const next = new Set(selectedIndices)
    if (next.has(index)) {
      next.delete(index)
    }
    else {
      next.add(index)
    }
    setSelectedIndices(next)
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

  // ---- 应用一次叫主声明 ----
  function applyDeclare(decl: Declaration) {
    const prev = bidStateRef.current
    const next: BidState = {
      current: decl,
      passes: 0,
      turnIndex: (prev.turnIndex + 1) % 4,
      history: [...prev.history, decl],
    }
    setBidState(next)
    setTrumpSuit(decl.suit)
    setBanker(decl.player)
  }

  // ---- 应用一次过牌 ----
  function applyPass() {
    const prev = bidStateRef.current
    const nextPasses = prev.passes + 1
    if (nextPasses >= 4) {
      finishBidding(prev)
      return
    }
    setBidState({
      current: prev.current,
      passes: nextPasses,
      turnIndex: (prev.turnIndex + 1) % 4,
      history: prev.history,
    })
  }

  // ---- 结束叫主 ----
  function finishBidding(state: BidState) {
    const decl = state.current
    setTrumpSuit(decl?.suit ?? null)
    setBanker(decl?.player ?? ALL_POSITIONS[0])
    setPhase(GamePhase.Playing)
  }

  // ---- AI 自动叫主驱动 ----
  useEffect(() => {
    if (phase !== GamePhase.BiddingTrump || !hands) return
    const player = ALL_POSITIONS[bidState.turnIndex]
    if (playerModes[player] === PlayerMode.Manual) return // 等待玩家操作

    const timer = setTimeout(() => {
      const decl = aiChooseDeclare(hands[player], levelRank, bidState.current, player)
      if (decl) applyDeclare(decl)
      else applyPass()
    }, 900)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bidState, playerModes, hands])

  // ---- 初始发牌 ----
  useMemo(() => {
    if (!hands) startNewGame()
  }, [])

  // ---- 渲染 ----
  if (!hands) return null

  const biddingPlayer = ALL_POSITIONS[bidState.turnIndex]
  const isBidding = phase === GamePhase.BiddingTrump
  const manualBid =
    isBidding && playerModes[biddingPlayer] === PlayerMode.Manual

  // 手动玩家的合法声明（过滤为可覆盖当前）
  const manualOptions = manualBid
    ? getPossibleDeclarations(hands[biddingPlayer], levelRank, biddingPlayer)
      .filter(d => canOverride(d, bidState.current))
    : []

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
          cardCount={hands.N.length}
          faceUp={visibility.N}
          showToggle
          onToggleVisibility={() => toggleVisibility(PlayerPosition.North)}
        />
      </div>

      {/* ---- 中部：西家 + 牌桌 + 东家 ---- */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        {/* 西家 */}
        <OpponentHand
          position={PlayerPosition.West}
          cardCount={hands.W.length}
          faceUp={visibility.W}
          showToggle
          onToggleVisibility={() => toggleVisibility(PlayerPosition.West)}
        />

        {/* 牌桌中心 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          {/* 游戏标题 */}
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
            {isBidding
              ? (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                  叫主中… 轮到 {POSITION_NAME_ZH[biddingPlayer]}家
                  {bidState.current && (
                    <span style={{ color: '#7ee787', marginLeft: 6 }}>
                      （当前 {POSITION_NAME_ZH[bidState.current.player]}家 {declarationLabel(bidState.current)}）
                    </span>
                  )}
                </div>
              )
              : (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                  主牌：<b style={{ color: '#ffd700' }}>
                    {trumpSuit ? `主 ${SUIT_SYMBOL[trumpSuit]}` : '无主'}
                  </b>
                  {' · '}
                  庄家：<b style={{ color: '#7ee787' }}>
                    {banker ? `${POSITION_NAME_ZH[banker]}家` : '—'}
                  </b>
                </div>
              )}
          </div>

          {/* 新游戏按钮 */}
          <button
            onClick={startNewGame}
            style={{
              marginTop: 8,
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

          {/* 模式控制 */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {ALL_POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => toggleMode(pos)}
                style={{
                  padding: '6px 14px',
                  fontSize: 15,
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 4,
                  background: playerModes[pos] === PlayerMode.Manual
                    ? 'rgba(255,215,0,0.2)'
                    : 'rgba(100,200,255,0.15)',
                  color: playerModes[pos] === PlayerMode.Manual ? '#ffd700' : '#90caf9',
                }}
              >
                {POSITION_NAME_ZH[pos]}家·
                {playerModes[pos] === PlayerMode.Manual ? '手动' : '托管'}
              </button>
            ))}
          </div>
        </div>

        {/* 东家 */}
        <OpponentHand
          position={PlayerPosition.East}
          cardCount={hands.E.length}
          faceUp={visibility.E}
          showToggle
          onToggleVisibility={() => toggleVisibility(PlayerPosition.East)}
        />
      </div>

      {/* ---- 底部：南家（玩家） ---- */}
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
          <span style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.75)',
          }}>
            南家（你）
          </span>
          <span style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.5)',
          }}>
            {hands.S.length} 张
          </span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
        }}>
          <PlayerHand
            groups={groupCardsForDisplay(hands.S, trumpSuit, levelRank)}
            selectedIndices={selectedIndices}
            onToggleCard={toggleCard}
          />
        </div>
      </div>

      {/* ---- 叫主弹窗（手动玩家） ---- */}
      {manualBid && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          zIndex: 100,
        }}>
          <TrumpBidder
            player={biddingPlayer}
            levelRank={levelRank}
            current={bidState.current}
            options={manualOptions}
            onDeclare={applyDeclare}
            onPass={applyPass}
          />
        </div>
      )}
    </div>
  )
}

export default App

