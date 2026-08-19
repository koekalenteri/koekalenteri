import { defineConfig } from 'vitest/config'

const backendProject = process.argv.includes('--project=backend')

const coverage = {
  provider: 'v8' as const,
  reporter: ['text', 'html', 'clover', 'json', 'lcov'] as const,
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
    passWithNoTests: true,
    testTimeout: 10_000,
    coverage,
    projects: [
      {
        test: {
          name: 'backend',
          globals: true,
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
          maxWorkers: 2,
          include: ['src/**/__tests__/**/*.{js,jsx,ts,tsx}', 'src/**/*.{spec,test}.{js,jsx,ts,tsx}'],
          exclude: ['src/lambda/**'],
          setupFiles: ['react-app-polyfill/jsdom', './src/setupTests.tsx'],
        },
      },
    ],
  },
})
