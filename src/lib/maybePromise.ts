/**
 * A value that an atom may hold either settled or still loading.
 *
 * A derived atom written as `atom(async (get) => ...)` returns a new pending Promise on every
 * recompute, even when everything it awaits has long since settled. Each dependency change then
 * suspends every subscriber and swaps the page for its nearest Suspense fallback: a saved event,
 * an edited user or a refreshed id token looked like a reload of the whole page. A getter that
 * chains `.then` only while the source is still loading keeps the page mounted once it has loaded.
 *
 * The other way round matters too. React warns when a component that suspended on a Promise at
 * mount finishes a later render without one, so the first load's Promise stays the value until
 * something replaces the data (see `loadedAtom`), and a reader that comes along after it settled
 * gets the settled value synchronously from the Promise's own record instead of a new `.then`.
 */

/** A Promise that records what it settled with. */
export type Tracked<T> = Promise<T> & { settled?: { value: T } }

export type MaybePromise<T> = T | Tracked<T>

const isTracked = <T>(value: MaybePromise<T>): value is Tracked<T> => value instanceof Promise

/** Remembers what the Promise settles with, so a read after that gets the value synchronously. */
export const trackSettled = <T>(promise: Promise<T>): Tracked<T> => {
  const tracked: Tracked<T> = promise
  tracked.then(
    (value) => {
      tracked.settled = { value }
    },
    () => undefined
  )
  return tracked
}

/** `fn` applied to the value now if it is settled, and through `.then` if it is still loading. */
export const mapMaybe = <T, R>(value: MaybePromise<T>, fn: (value: T) => R): MaybePromise<R> => {
  if (!isTracked(value)) return fn(value)
  return value.settled ? fn(value.settled.value) : trackSettled(value.then(fn))
}

/** The value itself, synchronously once it has settled. */
export const asSettled = <T>(value: MaybePromise<T>): MaybePromise<T> => mapMaybe(value, (settled) => settled)

type Settled<T extends readonly unknown[]> = { -readonly [K in keyof T]: Awaited<T[K]> }

const settledValue = <T>(value: MaybePromise<T>): { value: T } | undefined =>
  isTracked(value) ? value.settled : { value }

/** The values as an array now if all of them are settled, and as `Promise.all` of them otherwise. */
export function allMaybe<const T extends readonly MaybePromise<unknown>[]>(values: T): MaybePromise<Settled<T>>
export function allMaybe(values: readonly MaybePromise<unknown>[]): MaybePromise<unknown[]> {
  const settled = values.map((value) => settledValue(value))
  return settled.every((item): item is { value: unknown } => item !== undefined)
    ? settled.map((item) => item.value)
    : trackSettled(Promise.all(values))
}
