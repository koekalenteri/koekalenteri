module.exports = {
  transform: {
    '.+\\.ts$': '<rootDir>/jest.transform.js',
  },
  coverageProvider: 'v8',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['node_modules', '<rootDir>/__test__'],
}
