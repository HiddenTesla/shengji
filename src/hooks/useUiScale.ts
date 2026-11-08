// ============================================================
// useUiScale —— 窗口不够高（或不够宽）时把整个游戏界面等比缩小
// 布局仍按「设计基准尺寸」排版（--app-width / --app-height），再用 transform
// 缩放到真实窗口大小（--ui-scale）；这样矮窗口下也能一屏看到全部内容，
// 而不是让牌桌 / 四家手牌被 overflow:hidden 裁掉。
// 返回值直接交给根节点 `.app` 的 style。
// ============================================================

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { cssVars } from '../utils/cssVars.ts';

/** 设计基准尺寸：真实窗口小于它时整体等比缩小 */
const DESIGN_WIDTH = 1100;
const DESIGN_HEIGHT = 900;
/** 最小缩放：再小也不缩了，避免文字小到看不清（更矮的窗口仍可能被裁切） */
const MIN_SCALE = 0.4;

interface UiScale {
  /** 界面缩放比例（1 = 不缩放） */
  scale: number;
  /** 缩放前的布局宽度（真实窗口宽度 / scale） */
  width: number;
  /** 缩放前的布局高度（真实窗口高度 / scale） */
  height: number;
}

function measure(): UiScale {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(
    1,
    Math.max(MIN_SCALE, Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT)),
  );
  const rounded = Math.round(scale * 1000) / 1000;
  return {
    scale: rounded,
    width: Math.round(vw / rounded),
    height: Math.round(vh / rounded),
  };
}

export function useUiScale(): CSSProperties {
  const [size, setSize] = useState<UiScale>(measure);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setSize(measure());
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return useMemo(() => cssVars({
    '--ui-scale': String(size.scale),
    '--app-width': `${size.width}px`,
    '--app-height': `${size.height}px`,
  }), [size]);
}
