// ============================================================
// 极简测试框架
// 项目是纯 Vite + TS，且离线环境装不了 vitest；这里只提供最小的
// describe / it / expectXxx + 汇总，由 scripts/run-tests.mjs 用 esbuild
// 打包 src/core/__tests__/run.ts 后执行。
// 用法：用例里直接 `describe(...)` / `it(...)`，失败会记录并继续跑完。
// ============================================================

interface Failure {
  title: string;
  message: string;
}

let passed = 0;
const failures: Failure[] = [];
let suite = '';

/** 分组（可嵌套） */
export function describe(name: string, fn: () => void): void {
  const prev = suite;
  suite = prev ? `${prev} › ${name}` : name;
  try {
    fn();
  } catch (err) {
    failures.push({ title: suite, message: `describe 内抛错：${messageOf(err)}` });
  } finally {
    suite = prev;
  }
}

/** 单个用例：抛错即失败，但不会中断其它用例 */
export function it(name: string, fn: () => void): void {
  const title = suite ? `${suite} › ${name}` : name;
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ title, message: messageOf(err) });
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 值相等（浅比较，够用：基本类型 / 数组 / 普通对象） */
export function expectEqual(actual: unknown, expected: unknown, note = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${note ? `${note}：` : ''}实际 ${a}，期望 ${e}`);
  }
}

/** 布尔断言 */
export function expectTrue(actual: boolean, note: string): void {
  if (!actual) throw new Error(`${note}：实际 false，期望 true`);
}

/** 汇总结果（由 run.ts 调用一次） */
export function report(): { passed: number; failures: Failure[] } {
  return { passed, failures };
}
