import type { CoverageV8Options } from 'vitest/node'
import { defineConfig } from 'vitest/config'

const backendProject = process.argv.includes('--project=backend')

const coverage: { provider: 'v8' } & CoverageV8Options = {
  provider: 'v8',
  reporter: ['text', 'html', 'clover', 'json', 'lcov'],
  include: backendProject ? ['src/lambda/**/*.ts'] : ['src/**/*.{js,jsx,ts,tsx}'],
  exclude: backendProject
    ? ['**/node_modules/**', '**/*.d.ts']
    : [
        '**/node_modules/**',
        '**/*.d.ts',
        'src/lambda/**',
        'src/i18n/locales/**',
        'src/types/**',
        'src/service-worker.js',
        'src/service-worker-unregister.js',
      ],
}

export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: '0',
  },
  test: {
    globals: true,
    maxWorkers: 2,
    passWithNoTests: true,
    testTimeout: 10_000,
    coverage,
    projects: [
      {
        test: {
          name: 'backend',
          globals: true,
          testTimeout: 10_000,
          unstubEnvs: true,
          environment: 'node',
          include: ['src/lambda/**/*.{spec,test}.ts'],
        },
      },
      {
        resolve: {
          alias: {
            'react-i18next': new URL('./src/__mocks__/react-i18next/index.tsx', import.meta.url).pathname,
          },
        },
        test: {
          name: 'frontend',
          clearMocks: true,
          fakeTimers: {
            toFake: ['Date'],
          },
          globals: true,
          unstubEnvs: true,
          environment: 'jsdom',
          testTimeout: 10_000,
          include: ['src/**/__tests__/**/*.{js,jsx,ts,tsx}', 'src/**/*.{spec,test}.{js,jsx,ts,tsx}'],
          exclude: ['src/lambda/**'],
          setupFiles: ['react-app-polyfill/jsdom', './src/setupTests.tsx'],
        },
      },
    ],
  },
})
