/** Detect whether we're running under a test runner in either node or jsdom. */
const isTestRunnerDefined = (): boolean => {
  const global = globalThis as unknown as {
    vi?: unknown
    expect?: unknown
    describe?: unknown
  }

  if (global.vi !== undefined) return true
  if (global.expect !== undefined && global.describe !== undefined) return true
  return false
}

export const isDevEnv = (detectTestRunner: () => boolean = isTestRunnerDefined): boolean =>
  (process.env.NODE_ENV === 'development' || Boolean(process.env.REACT_APP_API_BASE_URL?.endsWith('/dev'))) &&
  !detectTestRunner()

export const isTestEnv = (detectTestRunner: () => boolean = isTestRunnerDefined): boolean =>
  process.env.NODE_ENV === 'test' || detectTestRunner()

export const isProdEnv = (): boolean => process.env.NODE_ENV === 'production'

export const stackName = (
  detectTestRunner: () => boolean = isTestRunnerDefined
): 'koekalenteri-dev' | 'koekalenteri-test' | 'koekalenteri-prod' => {
  if (isDevEnv(detectTestRunner)) return 'koekalenteri-dev'
  if (isTestEnv(detectTestRunner)) return 'koekalenteri-test'
  return 'koekalenteri-prod'
}
