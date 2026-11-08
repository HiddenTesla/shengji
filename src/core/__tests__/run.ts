// ============================================================
// 测试入口：import 所有 *.test.ts（用例在 import 时注册），最后汇总
// 由 scripts/run-tests.mjs 用 esbuild 打包后执行。
// ============================================================

import './trick.test.ts';
import './round.test.ts';
import { report } from './harness.ts';

/** 汇总结果（供 scripts/run-tests.mjs 读取） */
export const result = report();
