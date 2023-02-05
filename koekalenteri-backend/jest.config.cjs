
module.exports = {
  transform: {
    '^.+\\.ts$': '<rootDir>/jest.transform.js',
  },
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  modulePathIgnorePatterns: [
    "<rootDir>/.aws-sam",
    "<rootDir>/__tests__/fixtures",
    "<rootDir>/__tests__/utils",
    "<rootDir>/__tests__/global-setup.js",
  ],
}
