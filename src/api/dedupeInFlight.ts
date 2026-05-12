export function dedupeInFlight<TArgs extends readonly unknown[], TResult>(
  getKey: (...args: TArgs) => string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  const pending = new Map<string, Promise<TResult>>()

  return (...args: TArgs) => {
    const key = getKey(...args)
    const pendingRequest = pending.get(key)

    if (pendingRequest) {
      return pendingRequest
    }

    const request = fn(...args).finally(() => {
      pending.delete(key)
    })

    pending.set(key, request)

    return request
  }
}
