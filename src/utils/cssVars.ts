import type { CSSProperties } from 'react';

/**
 * 生成 CSS 自定义属性 style（`{'--foo': '1px'}` 不在 React 的 CSSProperties 类型里）。
 * 用于把运行时数值交给 SCSS 消费，避免整块内联样式。
 */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}
