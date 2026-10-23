// ESLint flat config (eslint v9)
// 只启用项目要求的风格规则，不动其它规则，避免一次性产生大量无关报错。
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@stylistic': stylistic,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // 多行时必须有尾逗号
      'comma-dangle': ['error', 'always-multiline'],
      // statement 必须有分号
      semi: ['error', 'always'],
      // JSX 属性为 true 时不能省略 true（写 disabled={true} 而不是 disabled）
      'react/jsx-boolean-value': ['error', 'always'],
      // 源码里有 // eslint-disable-next-line react-hooks/exhaustive-deps，
      // 需要注册该规则才能解析这些注释（warn 级别，不会阻塞 build）
      'react-hooks/exhaustive-deps': 'warn',
      // type / interface 的成员换行时必须有分隔符（分号）
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'semi', requireLast: true },
          singleline: { delimiter: 'semi', requireLast: false },
          multilineDetection: 'brackets',
        },
      ],
    },
  },
);
