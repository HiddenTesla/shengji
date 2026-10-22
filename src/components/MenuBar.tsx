// ============================================================
// 顶部菜单栏 —— 「游戏」「查看」菜单
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MenuBarProps {
  /** 点击「新的一局」：只负责发起请求，由 App 弹确认框 */
  onNewGame: () => void
  /** 点击「原样发牌」：牌序不变，仅清除报主记录重新发牌 */
  onRedealSameCards: () => void
  /** 点击「自定义规则」：由 App 弹出只读的规则选项说明 */
  onViewRules: () => void
  /** 点击「出牌记录」：显示本局出牌（不含发牌记录） */
  onViewPlayLog: () => void
}

/** 菜单栏下沿的偏移量（供 App 里绝对定位的浮层使用） */
export const MENU_BAR_OFFSET = 'calc(var(--menu-bar-height) + 8px)'

/** 菜单栏文字尺寸：同样随窗口高度轻微缩放 */
const BAR_FONT_SIZE = 'clamp(13px, 1.6vh, 17px)'

const ROOT_STYLE: React.CSSProperties = {
  position: 'relative',
  zIndex: 40,
  flexShrink: 0,
  height: 'var(--menu-bar-height)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 clamp(8px, 1vw, 16px)',
  background: 'rgba(0,0,0,0.42)',
  borderBottom: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.85)',
  fontSize: BAR_FONT_SIZE,
}

const MENU_BUTTON_STYLE: React.CSSProperties = {
  padding: '0 clamp(10px, 1vw, 16px)',
  height: 'calc(var(--menu-bar-height) - 8px)',
  display: 'flex',
  alignItems: 'center',
  fontSize: BAR_FONT_SIZE,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: '#fff',
  fontWeight: 600,
}

const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 'clamp(6px, 1vh, 11px) clamp(12px, 1vw, 18px)',
  fontSize: BAR_FONT_SIZE,
  textAlign: 'left',
  cursor: 'pointer',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: '#fff',
}

const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  minWidth: 'clamp(150px, 15vw, 220px)',
  padding: 4,
  borderRadius: 6,
  background: '#20301f',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
}

function MenuItem({ onClick, children }: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={MENU_ITEM_STYLE}
      onMouseEnter={event => {
        event.currentTarget.style.background = 'rgba(255,255,255,0.14)'
      }}
      onMouseLeave={event => {
        event.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

type MenuKey = 'game' | 'view'

export default function MenuBar({
  onNewGame,
  onRedealSameCards,
  onViewRules,
  onViewPlayLog,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // 点击菜单外 / 按 Esc 关闭
  useEffect(() => {
    if (openMenu === null) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu])

  const toggle = (menu: MenuKey) => {
    setOpenMenu(prev => (prev === menu ? null : menu))
  }
  const closeThen = (action: () => void) => {
    setOpenMenu(null)
    action()
  }

  return (
    <div
      ref={rootRef}
      style={ROOT_STYLE}
    >
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => toggle('game')}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'game'}
          style={{
            ...MENU_BUTTON_STYLE,
            background: openMenu === 'game' ? 'rgba(255,255,255,0.18)' : 'transparent',
          }}
        >
          游戏
        </button>

        {openMenu === 'game' && (
          <div role="menu" style={DROPDOWN_STYLE}>
            <MenuItem onClick={() => closeThen(onNewGame)}>
              新的一局…
            </MenuItem>
            <MenuItem onClick={() => closeThen(onRedealSameCards)}>
              原样发牌…
            </MenuItem>
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => toggle('view')}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'view'}
          style={{
            ...MENU_BUTTON_STYLE,
            background: openMenu === 'view' ? 'rgba(255,255,255,0.18)' : 'transparent',
          }}
        >
          查看
        </button>

        {openMenu === 'view' && (
          <div role="menu" style={DROPDOWN_STYLE}>
            <MenuItem onClick={() => closeThen(onViewPlayLog)}>
              出牌记录…
            </MenuItem>
            <MenuItem onClick={() => closeThen(onViewRules)}>
              自定义规则…
            </MenuItem>
          </div>
        )}
      </div>

      {/* 右侧标题（纯展示） */}
      <span style={{
        marginLeft: 'auto',
        marginRight: 4,
        color: 'rgba(255,255,255,0.45)',
        fontSize: 'clamp(11px, 1.3vh, 14px)',
        letterSpacing: 1,
      }}>
        升级 · 拖拉机
      </span>
    </div>
  )
}
