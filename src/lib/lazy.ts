const CHUNK_LOAD_RELOAD_KEY = 'koekalenteri:chunk-load-reloaded'

const CHUNK_LOAD_ERROR_RE =
  /Loading (CSS )?chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/

export const isChunkLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const { message, name } = error as { message?: unknown; name?: unknown }

  return name === 'ChunkLoadError' || (typeof message === 'string' && CHUNK_LOAD_ERROR_RE.test(message))
}

const wasChunkLoadReloadAttempted = () => {
  try {
    return sessionStorage.getItem(CHUNK_LOAD_RELOAD_KEY) === 'true'
  } catch {
    return true
  }
}

const markChunkLoadReloadAttempted = () => {
  try {
    sessionStorage.setItem(CHUNK_LOAD_RELOAD_KEY, 'true')
  } catch {
    // Ignore storage failures. The reload attempt is still better than surfacing
    // a stale chunk error immediately.
  }
}

export async function reloadOnChunkLoadError<T>(
  load: () => Promise<T>,
  reload: () => void = () => window.location.reload()
): Promise<T> {
  try {
    const value = await load()
    try {
      sessionStorage.removeItem(CHUNK_LOAD_RELOAD_KEY)
    } catch {
      // Ignore storage failures.
    }
    return value
  } catch (error) {
    if (typeof window !== 'undefined' && isChunkLoadError(error) && !wasChunkLoadReloadAttempted()) {
      markChunkLoadReloadAttempted()
      reload()
      return new Promise<T>(() => undefined)
    }

    throw error
  }
}
