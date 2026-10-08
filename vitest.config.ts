/**
 * vitest.config.ts — Prompt 4 (Part 10)
 * پیکربندی مستقل Vitest (جدا از vite.config.ts که PORT نیاز دارد)
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    reporter: 'verbose',
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/utils/**', 'src/types/**', 'src/core/**'],
      exclude: ['**/*.test.ts', '**/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
