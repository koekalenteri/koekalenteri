import type { Location } from '../../../../types'
import { createStore } from 'jotai'
import { vi } from 'vitest'
import { adminLocationNamesAtom } from './atoms'

const locations: Location[] = [
  { district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' },
  { district: 'Uudenmaan Kennelpiiri', id: 2, name: 'Vantaa' },
]

const remote = vi.hoisted(() => ({ fail: false }))

vi.mock('./remoteAtoms', async () => {
  const { atom } = await import('jotai')
  return {
    adminLocationsRemoteAtom: atom(async () => {
      if (remote.fail) throw new Error('offline')
      return [
        { district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' },
        { district: 'Uudenmaan Kennelpiiri', id: 2, name: 'Vantaa' },
      ]
    }),
  }
})

describe('adminLocationNamesAtom', () => {
  beforeEach(() => {
    remote.fail = false
  })

  it('returns the municipality names', async () => {
    const store = createStore()

    await expect(store.get(adminLocationNamesAtom)).resolves.toEqual(locations.map((l) => l.name))
  })

  it('falls back to an empty list when the collection fails to load, so the event form still renders', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    remote.fail = true
    const store = createStore()

    await expect(store.get(adminLocationNamesAtom)).resolves.toEqual([])
    expect(error).toHaveBeenCalled()
  })
})
