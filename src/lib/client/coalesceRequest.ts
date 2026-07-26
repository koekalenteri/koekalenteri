const pendingRequests = new Map<string, Promise<unknown>>()

/**
 * Shares one promise between callers while an idempotent request is pending.
 *
 * Callers must namespace keys by endpoint and include every input that changes
 * the response. Do not use this for mutations or independently cancellable
 * requests unless their cancellation semantics are handled explicitly.
 */
export const coalesceRequest = <T>(key: string, factory: () => Promise<T>): Promise<T> => {
  const pending = pendingRequests.get(key)
  if (pending) return pending as Promise<T>

  const request = Promise.resolve().then(factory)
  const coalesced = request.finally(() => {
    if (pendingRequests.get(key) === coalesced) {
      pendingRequests.delete(key)
    }
  })
  pendingRequests.set(key, coalesced)
  return coalesced
}
