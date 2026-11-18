import { defineConfig } from 'vitest/config';

export default defineConfig({
  exclude: ['**/node_modules/**', '**/dist/**'],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
