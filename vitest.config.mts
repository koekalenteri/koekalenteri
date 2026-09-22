import type { CoverageV8Options } from 'vitest/node'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { a11yRatchet } from './scripts/a11yRatchet.mjs'
import { platformFonts } from './scripts/platformFonts.mjs'
import { resetMouse } from './scripts/resetMouse.mjs'

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
        // Browser-mode visual tests and their scaffolding: exercised by the `visual` project,
        // which runs separately and reports no coverage into this run.
        'src/**/*.visual.test.tsx',
        'src/pages/components/stats/statsVisualFixtures.tsx',
        'src/setupVisualTests.ts',
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
          testTimeout: 10_000,
          unstubEnvs: true,
          environment: 'node',
          // src/i18n/lambda.ts is lambda-only code, and its test asserts what a cold start sees:
          // an i18next nobody has initialized yet. In the frontend project the setup file has
          // already initialized the shared instance, so the assertion would be vacuous there.
          include: ['src/lambda/**/*.{spec,test}.ts', 'src/i18n/lambda.test.ts'],
          setupFiles: ['./src/lambda/setupTests.ts'],
        },
      },
      {
        resolve: {
          alias: {
            // Deliberately NOT aliasing react-i18next here, unlike the other projects: the mock
            // echoes the key back, so every label would be three characters wide and a layout that
            // overflows with real text would still screenshot clean. These run the real
            // translations -- "chesapeakelahdennoutaja", not "263".
            '@': new URL('./src', import.meta.url).pathname,
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
          name: 'visual',
          globals: true,
          testTimeout: 30_000,
          // Layout is done by the browser (and, for charts, by d3 scales); jsdom reports no element
          // sizes, so a component rendered there is not the one anyone sees. These run in a real browser.
          include: ['src/**/*.visual.{spec,test}.{ts,tsx}'],
          setupFiles: ['./src/setupVisualTests.ts'],
          browser: {
            enabled: true,
            // The test iframe is scaled down to fit the browser window, and Playwright's default window
            // is 1280x720: shorter than the iframe below, so every capture came out at 80 %. A window no
            // test outgrows keeps the captures pixel for pixel -- a whole form on a phone runs well past
            // a screen's height.
            provider: playwright({
              contextOptions: {
                // The charts skip their grow/draw animation when the viewer prefers reduced motion,
                // so a capture never catches a half-drawn bar.
                reducedMotion: 'reduce',
                viewport: { height: 3000, width: 1280 },
              },
            }),
            headless: true,
            screenshotFailures: false,
            // Every screenshot is also an axe audit (setupVisualTests); this is the Node side that
            // keeps the known violations in scripts/a11y-baseline.json.
            commands: { a11yRatchet, platformFonts, resetMouse },
            instances: [{ browser: 'chromium' }],
            viewport: { width: 1200, height: 900 },
            expect: {
              toMatchScreenshot: {
                comparatorName: 'pixelmatch',
                // `threshold` is how different one pixel must be to count at all, and it is the
                // one that matters. At 0.2 it took a difference of 1409 in pixelmatch's YIQ metric;
                // recolouring the error red from #ff1744 to #c62828 is 488, so a palette change
                // across the whole app registered as zero differing pixels and no allowance below
                // could have caught it (KOE-1375). At pixelmatch's own default of 0.1 the cutoff is
                // 352 and the same change reads as 790 pixels on one screenshot.
                //
                // The count is then what absorbs the real noise: glyph edges rasterise a pixel or
                // two differently from run to run, on the same machine and the same browser.
                // Measured at threshold 0.1 by running the whole suite with no allowance, eight
                // times on darwin and six on linux: 5 to 166 pixels, landing on a different
                // screenshot each run. 400 is a little over twice the worst of that.
                //
                // Absolute rather than a ratio, because the noise is absolute — a few pixels of
                // text edge, not a share of the image. A ratio is loose where the image is large
                // and tight where it is small, which is backwards; the 1 % it replaces was 10 800
                // pixels on the default 1200x900 viewport (KOE-1429).
                comparatorOptions: { allowedMismatchedPixels: 400, threshold: 0.1 },
              },
            },
          },
        },
      },
      {
        resolve: {
          alias: {
            'react-i18next': new URL('./src/__mocks__/react-i18next/index.tsx', import.meta.url).pathname,
            '@': new URL('./src', import.meta.url).pathname,
            'test-utils': new URL('./src/test-utils', import.meta.url).pathname,
          },
        },
        test: {
          name: 'frontend',
          clearMocks: true,
          fakeTimers: {
            // Timers are faked alongside Date so that flushPromises can run a pending debounce or a
            // MUI transition instantly instead of sleeping through it. Testing Library's waitFor
            // cooperates with the faked clock through the `jest` shim in setupTests.
            toFake: [
              'Date',
              'setTimeout',
              'clearTimeout',
              'setInterval',
              'clearInterval',
              'setImmediate',
              'clearImmediate',
              // The DataGrid defers its ResizeObserver callback to the next animation frame, so a
              // clock that does not drive rAF leaves the grid believing it has no size, and no rows.
              'requestAnimationFrame',
              'cancelAnimationFrame',
            ],
          },
          globals: true,
          unstubEnvs: true,
          environment: 'jsdom',
          testTimeout: 10_000,
          include: ['src/**/__tests__/**/*.{js,jsx,ts,tsx}', 'src/**/*.{spec,test}.{js,jsx,ts,tsx}'],
          exclude: ['src/lambda/**', 'src/i18n/lambda.test.ts', 'src/**/*.visual.{spec,test}.{ts,tsx}'],
          setupFiles: ['react-app-polyfill/jsdom', './src/setupTests.tsx'],
        },
      },
    ],
  },
})
