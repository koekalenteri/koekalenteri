import type { Config } from 'jest'

const config: Config = {
  collectCoverageFrom: ['<rootDir>/**/*.ts', '!<rootDir>/**/*.d.ts'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  transform: {
    '.+\\.ts$': '<rootDir>/jest.transform.mjs',
  },
  // transformIgnorePatterns: ['.+\\.test\\.ts$'],
}

export default config
