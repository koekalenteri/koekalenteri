import type { Config } from 'jest'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Jest 30 loads TS config in ESM mode; __dirname is not available.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const config: Config = {
  coverageProvider: 'v8',
  watchPlugins: ['jest-watch-typeahead/filename', 'jest-watch-typeahead/testname'],
  testTimeout: 10000,

  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/src/lambda'],
      testMatch: ['<rootDir>/src/lambda/**/?(*.)+(spec|test).ts'],
      collectCoverageFrom: ['<rootDir>/src/lambda/**/*.ts', '!<rootDir>/src/lambda/**/*.d.ts'],
      coveragePathIgnorePatterns: ['/node_modules/'],
      // Prevent stale transform artifacts. We rewrite JSON import syntax in
      // [`src/lambda/jest.transform.mjs`](src/lambda/jest.transform.mjs:1), and Jest's cache
      // can retain older output containing `assert { type: "json" }`, which Node/Jest may
      // fail to parse depending on execution context.
      cache: false,
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '.+\\.ts$': '<rootDir>/src/lambda/jest.transform.mjs',
      },
      // Backend uses modern ESM dependencies (remark-* etc.). Transform them.
      transformIgnorePatterns: [
        'node_modules/(?!(remark-breaks|remark-gfm|remark-html|remark-parse|unified|unist-builder|unist-util-visit|mdast-util-to-hast)/)',
      ],
    },
    {
      displayName: 'frontend',
      rootDir: __dirname,
      collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}', '!src/**/*.d.ts'],
      coveragePathIgnorePatterns: ['/node_modules/', '/src/lambda/', '/src/i18n/locales', '/src/types'],
      roots: ['<rootDir>/src'],
      setupFiles: ['react-app-polyfill/jsdom'],
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.tsx'],
      testEnvironment: 'jsdom',
      // Prevent Jest from resolving packages via the `browser` export condition.
      // In this repo that can cause ESM browser builds (e.g. nanoid's
      // `index.browser.js`) to be loaded in a CJS context.
      testEnvironmentOptions: {
        customExportConditions: ['node', 'node-addons'],
      },
      testMatch: ['<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}', '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}'],
      testPathIgnorePatterns: ['/node_modules/', 'src/lambda'],
      transform: {
        '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$': '<rootDir>/config/jest/babelTransform.js',
        '^.+\\.css$': '<rootDir>/config/jest/cssTransform.mjs',
        '^(?!.*\\.(js|jsx|mjs|cjs|ts|tsx|css|json)$)': '<rootDir>/config/jest/fileTransform.mjs',
      },
      cache: false,
      // Jest still runs tests in a CJS-ish execution environment. Some deps (e.g. nanoid v5)
      // are ESM-only and must be transformed.
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      transformIgnorePatterns: [
        'node_modules/(?!(react-dnd|dnd-core|@react-dnd|react-dnd-html5-backend|nanoid|notistack|mui-tel-input)/)',
      ],
      moduleFileExtensions: ['web.js', 'js', 'web.ts', 'ts', 'web.tsx', 'tsx', 'json', 'web.jsx', 'jsx', 'node'],
      modulePaths: [],
      moduleNameMapper: {
        '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
        '\\.(css|less)$': 'identity-obj-proxy',
      },
      resetMocks: true,
    },
  ],
}

export default config
