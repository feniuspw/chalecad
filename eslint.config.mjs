import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', '**/next-env.d.ts', '**/playwright-report/**', '**/test-results/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,mjs}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // O motor é puro: sem React, Three.js, Node ou APIs de navegador.
    files: ['packages/engine/src/**/*.ts', 'packages/catalog/src/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'three', 'three/*', '@react-three/*', 'next', 'next/*', 'node:*', 'fs', 'path'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'indexedDB'],
    },
  },
);
