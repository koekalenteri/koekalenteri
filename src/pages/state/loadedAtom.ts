import type { Atom } from 'jotai'
import type { MaybePromise } from '@/lib/maybePromise'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { trackSettled } from '@/lib/maybePromise'

/**
 * A remote value served so that the page reading it stays mounted.
 *
 * The first load is the fetch's own Promise, and stays so after it settles: a component that
 * suspended on it at mount reads the same Promise when it finishes, which React requires (it warns
 * when a mount that suspended on `use()` finishes a render without one). A reader that arrives
 * later gets the settled value synchronously through `mapMaybe`.
 *
 * Every later load, after a refreshed id token or a forced refresh, is served as the last settled
 * value while it is on its way and as the new value once it has settled, never as a Promise: a
 * mounted page does not suspend on data it already has.
 */
export const loadedAtom = <T>(remoteAtom: Atom<Promise<T>>): Atom<MaybePromise<T>> => {
  // Boxed, so the stand-in is the value as the fetch typed it, not the awaited form of it.
  const settledAtom = atom((get) => get(remoteAtom).then((value) => ({ value })))
  const standInAtom = unwrap(settledAtom, (previous) => previous)
  const firstLoads = new WeakSet<Promise<T>>()
  return atom((get): MaybePromise<T> => {
    const remote = trackSettled(get(remoteAtom))
    const loaded = get(standInAtom)
    // A null is not data either: a signed-out session's user does not stand in for the next login's.
    if (loaded?.value == null) firstLoads.add(remote)
    if (loaded === undefined || firstLoads.has(remote)) return remote
    return loaded.value
  })
}
