const CHUNK_LOAD_RELOAD_KEY = 'koekalenteri:chunk-load-reloaded'

/**
 * How long after a reload a chunk that fails again is taken for one the reload could not fix. The
 * mark expires rather than being cleared: a reload that lands on an eager page has no lazy load to
 * clear it with, and a mark that stayed refused every later update's reload in that tab (KOE-1755).
 */
const CHUNK_LOAD_RELOAD_WINDOW_MS = 60_000

const CHUNK_LOAD_ERROR_RE =
  /Loading (CSS )?chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/

export const isChunkLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false

  const { message, name } = error as { message?: unknown; name?: unknown }
  return name === 'ChunkLoadError' || (typeof message === 'string' && CHUNK_LOAD_ERROR_RE.test(message))
}

/**
 * A mark that is not a time (the `'true'` of the bundle before KOE-1755) or one from the future (the
 * clock moved back) allows a reload; the new mark is written as now, so neither can loop. A mark that
 * cannot be read refuses one, since there is no telling whether this load already follows a reload.
 */
const isChunkLoadReloadAllowed = (now: number) => {
  let mark: string | null
  try {
    mark = sessionStorage.getItem(CHUNK_LOAD_RELOAD_KEY)
  } catch {
    return false
  }
  const age = now - Number(mark)
  return mark === null || Number.isNaN(age) || age < 0 || age >= CHUNK_LOAD_RELOAD_WINDOW_MS
}

const markChunkLoadReloadAttempted = (now: number) => {
  try {
    sessionStorage.setItem(CHUNK_LOAD_RELOAD_KEY, String(now))
  } catch {
    // Ignore storage failures. The reload attempt is still better than surfacing
    // a stale chunk error immediately.
  }
}

export async function reloadOnChunkLoadError<T>(
  load: () => Promise<T>,
  reload: () => void = () => globalThis.location.reload(),
  now: () => number = Date.now
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    const time = now()
    if (globalThis.window !== undefined && isChunkLoadError(error) && isChunkLoadReloadAllowed(time)) {
      markChunkLoadReloadAttempted(time)
      reload()
      return new Promise<T>(() => undefined)
    }

    throw error
  }
}
