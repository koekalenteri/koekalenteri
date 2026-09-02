import type { CoverageV8Options } from 'vitest/node'
import { playwright } from '@vitest/browser-playwright'
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
        // Browser-mode chart tests and their scaffolding: exercised by the `charts` project,
        // which runs separately and reports no coverage into this run.
        'src/**/*.visual.test.tsx',
        'src/pages/components/stats/statsVisualFixtures.tsx',
        'src/setupChartTests.ts',
      ],
}

export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: '0',
  },
  test: {
    globals: true,
    // CI runners have limited cores; capping workers there avoids coverage-shard
    // instability. Locally, let Vitest use all available cores.
    maxWorkers: process.env.CI ? 2 : undefined,
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
            // Deliberately NOT aliasing react-i18next here, unlike the other projects: the mock
            // echoes the key back, so every label would be three characters wide and a chart that
            // overflows with real text would still screenshot clean. These run the real
            // translations -- "chesapeakelahdennoutaja", not "263".
            'test-utils': new URL('./src/test-utils', import.meta.url).pathname,
          },
        },
        // Components under visual test may transitively import modules that read process.env at
        // import time (amplify-env); a browser has no process, so give the expressions something
        // to compile against.
        define: {
          'process.env': {},
        },
        test: {
          name: 'charts',
          globals: true,
          testTimeout: 30_000,
          // Charts are laid out by the browser and by d3 scales; jsdom reports no element sizes,
          // so a chart rendered there is not the chart anyone sees. These run in a real browser.
          include: ['src/**/*.visual.{spec,test}.{ts,tsx}'],
          setupFiles: ['./src/setupChartTests.ts'],
          browser: {
            enabled: true,
            // The test iframe is scaled down to fit the browser window, and Playwright's default window
            // is 1280x720: shorter than the iframe below, so every capture came out at 80 %. A window no
            // test outgrows keeps the captures pixel for pixel -- a whole form on a phone runs well past
            // a screen's height.
            provider: playwright({ contextOptions: { viewport: { height: 3000, width: 1280 } } }),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
            viewport: { width: 1200, height: 900 },
            expect: {
              toMatchScreenshot: {
                comparatorName: 'pixelmatch',
                // Antialiasing differs slightly between runs and machines; a small allowance
                // keeps that from failing a build while still catching real layout changes.
                comparatorOptions: { allowedMismatchedPixelRatio: 0.01, threshold: 0.2 },
              },
            },
          },
        },
      },
      {
        resolve: {
          alias: {
            'react-i18next': new URL('./src/__mocks__/react-i18next/index.tsx', import.meta.url).pathname,
            'test-utils': new URL('./src/test-utils', import.meta.url).pathname,
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
          exclude: ['src/lambda/**', 'src/**/*.visual.{spec,test}.{ts,tsx}'],
          setupFiles: ['react-app-polyfill/jsdom', './src/setupTests.tsx'],
        },
      },
    ],
  },
})
