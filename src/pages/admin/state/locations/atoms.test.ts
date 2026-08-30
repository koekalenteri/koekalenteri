import type { PrimitiveAtom } from 'jotai'
import type { Location } from '../../../../types'
import { createStore } from 'jotai'
import { vi } from 'vitest'
import { adminLocationNamesAtom } from './atoms'
import { adminLocationsRemoteAtom } from './remoteAtoms'

const locations: Location[] = [
  { district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' },
  { district: 'Uudenmaan Kennelpiiri', id: 2, name: 'Vantaa' },
]

vi.mock('./remoteAtoms', async () => {
  const { atom } = await import('jotai')
  return {
    adminLocationsRemoteAtom: atom(
      Promise.resolve([
        { district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' },
        { district: 'Uudenmaan Kennelpiiri', id: 2, name: 'Vantaa' },
      ])
    ),
  }
})

const remoteAtom = adminLocationsRemoteAtom as unknown as PrimitiveAtom<Promise<Location[]>>

describe('adminLocationNamesAtom', () => {
  it('returns the municipality names', async () => {
    const store = createStore()

    await expect(store.get(adminLocationNamesAtom)).resolves.toEqual(locations.map((l) => l.name))
  })

  it('falls back to an empty list when the collection fails to load, so the event form still renders', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = createStore()
    store.set(remoteAtom, Promise.reject(new Error('offline')))

    await expect(store.get(adminLocationNamesAtom)).resolves.toEqual([])
    expect(error).toHaveBeenCalled()
  })
})
