import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/config/unit/setup.ts'],
    fileParallelism: true,
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/domain/**/*.{ts,tsx,js,jsx}'],
      exclude: ['src/domain/constants/**/*.ts'],
      clean: true,
      reportsDirectory: './coverage',
      reporter: [['text-summary'], ['lcov', { file: 'unit/lcov.info' }]],
      thresholds: {
        // it's a hackathon lol
        branches: 10,
        functions: 10,
        lines: 10,
        statements: 10,
      },
    },
    include: ['test/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['test/integration/**/*'],
  },
  resolve: {
    alias: {
      '@/': path.resolve(process.cwd(), './') + '/',
      '@domain': path.resolve(process.cwd(), './src/domain'),
      '@frontend': path.resolve(process.cwd(), './src/frontend'),
      '@server': path.resolve(process.cwd(), './src/server'),
      '@test': path.resolve(process.cwd(), './test'),
    },
  },
});
