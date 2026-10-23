// ============================================================
// 顶部菜单栏 —— 「游戏」「查看」菜单
// 样式：src/styles/components/_menu-bar.scss（BEM）
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface MenuBarProps {
  /** 点击「新的一局」：只负责发起请求，由 App 弹确认框 */
  onNewGame: () => void;
  /** 点击「原样发牌」：牌序不变，仅清除报主记录重新发牌 */
  onRedealSameCards: () => void;
  /** 点击「自定义规则」：由 App 弹出只读的规则选项说明 */
  onViewRules: () => void;
  /** 点击「出牌记录」：显示本局出牌（不含发牌记录） */
  onViewPlayLog: () => void;
}

/**
 * 菜单栏下沿的偏移量由 CSS 变量 `--menu-bar-offset` 提供（见 styles/_base.scss），
 * 绝对定位的浮层直接用 `top: var(--menu-bar-offset)`。
 */

function MenuItem({ onClick, children }: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="menuitem"
      className="menu-bar__item"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type MenuKey = 'game' | 'view'

export default function MenuBar({
  onNewGame,
  onRedealSameCards,
  onViewRules,
  onViewPlayLog,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击菜单外 / 按 Esc 关闭
  useEffect(() => {
    if (openMenu === null) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  const toggle = (menu: MenuKey) => {
    setOpenMenu(prev => (prev === menu ? null : menu));
  };
  const closeThen = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  const buttonClassName = (menu: MenuKey) =>
    openMenu === menu ? 'menu-bar__button menu-bar__button--open' : 'menu-bar__button';

  return (
    <div
      ref={rootRef}
      className="menu-bar"
    >
      <div className="menu-bar__group">
        <button
          className={buttonClassName('game')}
          onClick={() => toggle('game')}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'game'}
        >
          游戏
        </button>

        {openMenu === 'game' && (
          <div role="menu" className="menu-bar__dropdown">
            <MenuItem onClick={() => closeThen(onNewGame)}>
              新的一局…
            </MenuItem>
            <MenuItem onClick={() => closeThen(onRedealSameCards)}>
              原样发牌…
            </MenuItem>
          </div>
        )}
      </div>

      <div className="menu-bar__group">
        <button
          className={buttonClassName('view')}
          onClick={() => toggle('view')}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'view'}
        >
          查看
        </button>

        {openMenu === 'view' && (
          <div role="menu" className="menu-bar__dropdown">
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
      <span className="menu-bar__title">
        升级 · 拖拉机
      </span>
    </div>
  );
}
