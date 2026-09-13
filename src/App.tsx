// ============================================================
// 根组件 — 游戏主面板
// ============================================================

import { useState, useMemo } from 'react'
import {
  PlayerPosition,
  POSITION_NAME_ZH,
  PlayerMode,
  Rank,
  ALL_POSITIONS,
} from './core/types.ts'
import { sortCards, groupCardsForDisplay } from './core/card.ts'
import { createDecks, shuffleCards, dealCards } from './core/deck.ts'
import PlayerHand from './components/PlayerHand.tsx'
import OpponentHand from './components/OpponentHand.tsx'

function App() {
  // ---- 游戏状态 ----
  const [hands, setHands] = useState<Record<PlayerPosition, import('./core/types.ts').Card[]> | null>(null)
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

  const levelRank = Rank.Two

  // ---- 新一局 ----
  function startNewGame() {
    const deck = createDecks()
    shuffleCards(deck)
    const result = dealCards(deck, 8)

    const sorted: Record<PlayerPosition, import('./core/types.ts').Card[]> = {
      E: sortCards(result.hands.E, null, levelRank),
      S: sortCards(result.hands.S, null, levelRank),
      W: sortCards(result.hands.W, null, levelRank),
      N: sortCards(result.hands.N, null, levelRank),
    }

    setHands(sorted)
    setSelectedIndices(new Set())
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

  // ---- 初始发牌 ----
  useMemo(() => {
    if (!hands) startNewGame()
  }, [])

  // ---- 渲染 ----
  if (!hands) return null

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
            groups={groupCardsForDisplay(hands.S, null, levelRank)}
            selectedIndices={selectedIndices}
            onToggleCard={toggleCard}
          />
        </div>
      </div>
    </div>
  )
}

export default App

