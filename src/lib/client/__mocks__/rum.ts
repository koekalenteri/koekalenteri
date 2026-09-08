// No RUM in tests: the recorders do nothing, and callers that offered a fallback get it, which is
// what the real module does when there is no application id configured.
export const recordPageView = () => undefined
export const recordEvent = () => undefined
export const recordError = (_error: unknown, whenUnavailable?: () => void) => whenUnavailable?.()
