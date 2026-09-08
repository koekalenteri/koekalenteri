/** Detect whether we're running under a test runner in either node or jsdom. */
const isTestRunnerDefined = (): boolean => 'vi' in globalThis || ('expect' in globalThis && 'describe' in globalThis)

/**
 * The backend stage this frontend was built against, read from the last path segment of the API URL.
 * Anything that is not dev or test counts as prod, so a missing or local URL errs on the side of the
 * production behaviour.
 */
export const apiStage = (): 'dev' | 'test' | 'prod' => {
  const last = process.env.REACT_APP_API_BASE_URL?.split('/').pop()
  return last === 'dev' || last === 'test' ? last : 'prod'
}

export const isDevEnv = (detectTestRunner: () => boolean = isTestRunnerDefined): boolean =>
  (process.env.NODE_ENV === 'development' || apiStage() === 'dev') && !detectTestRunner()

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
