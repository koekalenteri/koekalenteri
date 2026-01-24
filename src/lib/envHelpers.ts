/**
 * Detect whether we're running under Jest.
 *
 * Jest v30 no longer guarantees a global `jest` object in all runtimes/configs,
 * so checking only `typeof jest !== 'undefined'` is not reliable.
 */
export const isJestDefined = (): boolean => {
  // Prefer checking the global object to avoid ReferenceErrors in ESM/strict mode.
  const g = globalThis as unknown as {
    jest?: unknown
    expect?: unknown
    describe?: unknown
  }

  if (typeof g?.jest !== 'undefined') return true
  // In many Jest setups, `expect`/`describe` exist even when `jest` is not global.
  if (typeof g?.expect !== 'undefined' && typeof g?.describe !== 'undefined') return true

  // Jest always sets this environment variable for workers.
  // (Works in both node and jsdom environments.)
  return (
    typeof process !== 'undefined' &&
    typeof process.env !== 'undefined' &&
    typeof process.env.JEST_WORKER_ID !== 'undefined'
  )
}
