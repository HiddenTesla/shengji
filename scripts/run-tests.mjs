// ============================================================
// 测试运行器
// 项目离线且未安装测试框架，这里用 vite 自带的 esbuild 把
// `src/core/__tests__/run.ts` 打成一个 ESM 包，再用 node 执行。
//
// 用法：npm test
// ============================================================

import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = await mkdtemp(join(tmpdir(), 'shengji-test-'));
const outFile = join(outDir, 'tests.mjs');

let result;
try {
  await build({
    entryPoints: ['src/core/__tests__/run.ts'],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'warning',
  });
  ({ result } = await import(pathToFileURL(outFile).href));
} finally {
  await rm(outDir, { recursive: true, force: true });
}

const { passed, failures } = result;
for (const failure of failures) {
  console.error(`✗ ${failure.title}\n    ${failure.message}`);
}
if (failures.length > 0) {
  console.error(`\n测试失败：${failures.length} 个用例未通过，${passed} 个通过`);
  process.exit(1);
}
console.log(`✅ 全部通过：${passed} 个用例`);
