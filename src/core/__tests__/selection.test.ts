// ============================================================
// 跟牌「队列式」选牌测试（src/utils/selection.ts）
// 选满张数后继续点新牌：挤掉最早选中的一张，必出牌不可挤。
// ============================================================

import { enqueueSelection } from '../../utils/selection.ts';
import { describe, expectEqual, expectTrue, it } from './harness.ts';

const sorted = (set: ReadonlySet<number> | null): number[] | null =>
  set ? [...set].sort((a, b) => a - b) : null;

describe('enqueueSelection', () => {
  it('未选满时直接加入', () => {
    expectEqual(sorted(enqueueSelection(new Set([1]), 2, 3, new Set())), [1, 2]);
  });

  it('选满后加入新牌会挤掉最早选中的那张', () => {
    // 依次点了 1、2、3，再点 4
    expectEqual(sorted(enqueueSelection(new Set([1, 2, 3]), 4, 3, new Set())), [2, 3, 4]);
    // 再点 5 → 挤掉 2
    expectEqual(sorted(enqueueSelection(new Set([2, 3, 4]), 5, 3, new Set())), [3, 4, 5]);
  });

  it('必出牌不会被挤掉', () => {
    // {0} 为必出牌，{1,2} 为手动选的，再点 3 → 挤掉 1
    expectEqual(sorted(enqueueSelection(new Set([0, 1, 2]), 3, 3, new Set([0]))), [0, 2, 3]);
    // 必出牌在中间/末尾也一样：挤掉的是最早的非必出牌
    expectEqual(sorted(enqueueSelection(new Set([3, 0, 7]), 9, 3, new Set([3, 7]))), [3, 7, 9]);
  });

  it('全部是必出牌时无法再加入', () => {
    expectTrue(
      enqueueSelection(new Set([0, 1, 2]), 3, 3, new Set([0, 1, 2])) === null,
      '只剩必出牌 → null',
    );
  });

  it('不修改传入的集合', () => {
    const original = new Set([1, 2, 3]);
    enqueueSelection(original, 4, 3, new Set());
    expectEqual(sorted(original), [1, 2, 3]);
  });
});
