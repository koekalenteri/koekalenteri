import { atom, createStore } from 'jotai'
import { flushPromises } from '../../test-utils/utils'
import { loadedAtom } from './loadedAtom'

describe('loadedAtom', () => {
  const deferred = <T>() => {
    let resolve: (value: T) => void = () => undefined
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  const setup = () => {
    const fetches: ReturnType<typeof deferred<string[] | null>>[] = []
    const keyAtom = atom(0)
    const remoteAtom = atom(async (get) => {
      get(keyAtom)
      const fetch = deferred<string[] | null>()
      fetches.push(fetch)
      return fetch.promise
    })
    const store = createStore()
    const loaded = loadedAtom(remoteAtom)
    // Mounted, as a page keeps it: the stand-in learns of a settled load only while subscribed.
    store.sub(loaded, () => undefined)
    return { fetches, keyAtom, loaded, store }
  }

  it('keeps the first load as the fetch Promise after it settles, so a mount that suspended on it reads it again', async () => {
    const { fetches, loaded, store } = setup()
    const first = store.get(loaded)
    expect(first).toBeInstanceOf(Promise)

    fetches[0].resolve(['a'])
    await flushPromises(false)

    expect(store.get(loaded)).toBe(first)
    await expect(first).resolves.toEqual(['a'])
  })

  it('serves the last settled value while a later load is on its way, and the new value once it has settled', async () => {
    const { fetches, keyAtom, loaded, store } = setup()
    fetches[0].resolve(['a'])
    await flushPromises(false)

    store.set(keyAtom, 1)
    expect(store.get(loaded)).toEqual(['a'])

    fetches[1].resolve(['b'])
    await flushPromises(false)
    expect(store.get(loaded)).toEqual(['b'])
  })

  it('does not let a null stand in for the next load', async () => {
    const { fetches, keyAtom, loaded, store } = setup()
    fetches[0].resolve(null)
    await flushPromises(false)
    await expect(store.get(loaded)).resolves.toBeNull()

    store.set(keyAtom, 1)
    const next = store.get(loaded)
    expect(next).toBeInstanceOf(Promise)
    fetches[1].resolve(['b'])
    await expect(next).resolves.toEqual(['b'])
  })
})
