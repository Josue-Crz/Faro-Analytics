import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
