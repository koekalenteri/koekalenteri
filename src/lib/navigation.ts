/**
 * Indirection for browser-level redirects.
 */
export function redirectTo(url: string) {
  window.location.assign(url)
}
