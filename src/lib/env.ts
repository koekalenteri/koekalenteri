/** Detect whether we're running under Jest in either node or jsdom. */
const isJestDefined = (): boolean => {
  const global = globalThis as unknown as {
    vi?: unknown
    expect?: unknown
    describe?: unknown
  }

  if (global.vi !== undefined) return true
  if (global.expect !== undefined && global.describe !== undefined) return true

  const runtimeProcess = typeof process === 'undefined' ? undefined : process
  return runtimeProcess?.env?.JEST_WORKER_ID !== undefined
}

export const isDevEnv = (detectJest: () => boolean = isJestDefined): boolean =>
  (process.env.NODE_ENV === 'development' || Boolean(process.env.REACT_APP_API_BASE_URL?.endsWith('/dev'))) &&
  !detectJest()

export const isTestEnv = (detectJest: () => boolean = isJestDefined): boolean =>
  process.env.NODE_ENV === 'test' || detectJest()

export const isProdEnv = (): boolean => process.env.NODE_ENV === 'production'

export const stackName = (
  detectJest: () => boolean = isJestDefined
): 'koekalenteri-dev' | 'koekalenteri-test' | 'koekalenteri-prod' => {
  if (isDevEnv(detectJest)) return 'koekalenteri-dev'
  if (isTestEnv(detectJest)) return 'koekalenteri-test'
  return 'koekalenteri-prod'
}
