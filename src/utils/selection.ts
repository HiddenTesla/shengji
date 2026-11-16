// ============================================================
// 手牌选中的小工具（纯函数，供 App.tsx 使用）
// ============================================================

/**
 * 跟牌选满后的「队列式」替换：
 * 已选张数达到上限时再点一张新牌 → 挤掉**最早选中**的一张（`Set` 保持插入顺序），
 * 必出牌（`locked`）不会被挤掉。
 *
 * @param selected 当前选中（含必出牌）
 * @param index    新点的牌
 * @param limit    本墩允许的选牌张数（= 首出张数）
 * @param locked   必出牌：始终保留、不可取消
 * @returns 新的选中集合；`null` = 无法添加（剩下的选中全是必出牌）
 */
export function enqueueSelection(
  selected: ReadonlySet<number>,
  index: number,
  limit: number,
  locked: ReadonlySet<number>,
): Set<number> | null {
  const next = new Set(selected);
  if (next.size >= limit) {
    const oldest = [...next].find(candidate => !locked.has(candidate));
    if (oldest === undefined) return null;
    next.delete(oldest);
  }
  next.add(index);
  return next;
}
