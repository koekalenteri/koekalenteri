/**
 * Indirection for browser-level redirects.
 */
export function redirectTo(url: string) {
  globalThis.location.assign(url)
}
