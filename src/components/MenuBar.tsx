// ============================================================
// 顶部菜单栏 —— 「游戏」「查看」「选项」菜单
// 样式：src/styles/components/_menu-bar.scss（BEM）
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPEED_LEVELS } from '../utils/speed.ts';

interface MenuBarProps {
  /** 点击「新的一局」：只负责发起请求，由 App 弹确认框 */
  onNewGame: () => void;
  /** 点击「原样发牌」：牌序不变，仅清除报主记录重新发牌 */
  onRedealSameCards: () => void;
  /** 点击「自定义规则」：由 App 弹出只读的规则选项说明 */
  onViewRules: () => void;
  /** 点击「出牌记录」：显示本局出牌（不含发牌记录） */
  onViewPlayLog: () => void;
  /** 点击「导出局面」：导出当前牌局状态 */
  onExportState: () => void;
  /** 点击「记牌器」：查看已出牌 / 剩余牌 */
  onViewTracker: () => void;
  /** 当前游戏速度档位（1..5） */
  gameSpeed: number;
  /** 选择速度档位（「选项 → 游戏速度」，不需要弹框） */
  onChangeSpeed: (level: number) => void;
}

/**
 * 菜单栏下沿的偏移量由 CSS 变量 `--menu-bar-offset` 提供（见 styles/_base.scss），
 * 绝对定位的浮层直接用 `top: var(--menu-bar-offset)`。
 */

function MenuItem({ onClick, checked, children }: {
  onClick: () => void;
  /** 传入时按「单选」项渲染（前面带勾） */
  checked?: boolean;
  children: ReactNode;
}) {
  const isRadio = checked !== undefined;
  return (
    <button
      role={isRadio ? 'menuitemradio' : 'menuitem'}
      aria-checked={isRadio ? checked : undefined}
      className={checked ? 'menu-bar__item menu-bar__item--checked' : 'menu-bar__item'}
      onClick={onClick}
    >
      {isRadio && (
        <span className="menu-bar__check">
          {checked ? '✓' : ''}
        </span>
      )}
      {children}
    </button>
  );
}

type MenuKey = 'game' | 'view' | 'options'

export default function MenuBar({
  onNewGame,
  onRedealSameCards,
  onViewRules,
  onViewPlayLog,
  onExportState,
  onViewTracker,
  gameSpeed,
  onChangeSpeed,
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
            <MenuItem onClick={() => closeThen(onExportState)}>
              导出局面…
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
            <MenuItem onClick={() => closeThen(onViewTracker)}>
              记牌器…
            </MenuItem>
            <MenuItem onClick={() => closeThen(onViewRules)}>
              自定义规则…
            </MenuItem>
          </div>
        )}
      </div>

      <div className="menu-bar__group">
        <button
          className={buttonClassName('options')}
          onClick={() => toggle('options')}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'options'}
        >
          选项
        </button>

        {openMenu === 'options' && (
          <div role="menu" className="menu-bar__dropdown">
            {/* 目前只有一个选项：光标移到「游戏速度」上，右侧展开速度子菜单 */}
            <div className="menu-bar__submenu-group">
              <button
                role="menuitem"
                aria-haspopup="menu"
                className="menu-bar__item menu-bar__item--parent"
              >
                游戏速度
                <span className="menu-bar__arrow">▸</span>
              </button>
              <div role="menu" className="menu-bar__submenu">
                {SPEED_LEVELS.map(level => (
                  <MenuItem
                    key={level}
                    checked={gameSpeed === level}
                    onClick={() => closeThen(() => onChangeSpeed(level))}
                  >
                    {level}
                  </MenuItem>
                ))}
              </div>
            </div>
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
