import type { PrimitiveAtom } from 'jotai'
import type { CapacityStatsEntry } from '../../../../types/Stats'
import { atom, createStore } from 'jotai'
import { getAdminCapacityStats } from '../../../../api/stats'
import { validIdTokenAtom } from '../../../state'
import { adminActiveEventTypesAtom } from '../eventTypes/derivedAtoms'
import { ALL_EVENT_TYPES_ID } from './atoms'
import { adminCapacityStatsAtom } from './remoteAtoms'

vi.mock('../../../../api/stats')
// Both are read-only derived atoms in the app; swapped for writable ones so a test can put the
// store into the state it wants without dragging in auth and the event-type fetch.
vi.mock('../../../state', () => ({ validIdTokenAtom: atom<string | null>(null) }))
vi.mock('../eventTypes/derivedAtoms', () => ({ adminActiveEventTypesAtom: atom<unknown[]>([]) }))

const mockGetAdminCapacityStats = vi.mocked(getAdminCapacityStats)

// adminCapacityStatsAtom is unwrapped so it never suspends: the first read triggers the fetch
// and returns the fallback, the resolved value lands on a later read once the promise settles.
const resolveAtom = async <T>(store: ReturnType<typeof createStore>, anAtom: Parameters<typeof store.get>[0]) => {
  store.get(anAtom)
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
  return store.get(anAtom) as T
}

const entry = (eventType: string): CapacityStatsEntry => ({
  cancelledRegistrations: 0,
  class: 'ALO',
  eventCount: 1,
  eventType,
  month: '2025-06',
  organizerId: 'org1',
  places: 20,
  reserve: 0,
  starters: 18,
})

/** A store with a signed-in user and the given active event types available to the picker. */
const storeWith = (eventTypes: string[], token: string | null = 'token') => {
  const store = createStore()
  // The mocked modules hand back writable atoms; the imported types still describe the derived
  // originals, so the two are re-typed here rather than at every call site.
  const tokenAtom = validIdTokenAtom as unknown as PrimitiveAtom<string | null>
  const typesAtom = adminActiveEventTypesAtom as unknown as PrimitiveAtom<{ active: boolean; eventType: string }[]>
  store.set(tokenAtom, token)
  store.set(
    typesAtom,
    eventTypes.map((eventType) => ({ active: true, eventType }))
  )
  return store
}

describe('adminCapacityStatsAtom', () => {
  beforeEach(() => {
    mockGetAdminCapacityStats.mockImplementation(async (_token, eventType) => [entry(eventType)])
  })

  it('fetches one event type from the admin endpoint with the organizer filter', async () => {
    const store = storeWith(['NOME-B'])

    const result = await resolveAtom<CapacityStatsEntry[]>(store, adminCapacityStatsAtom('NOME-B|org1'))

    expect(mockGetAdminCapacityStats).toHaveBeenCalledExactlyOnceWith('token', 'NOME-B', 'org1')
    expect(result).toEqual([entry('NOME-B')])
  })

  it('fans "all event types" out over the types the picker offers, not a fixed list', async () => {
    // The picker is built from the active event types, so a non-official type the user can
    // select on its own has to be part of "all" as well.
    const store = storeWith(['NOME-B', 'NOWT', 'CUSTOM'])

    const result = await resolveAtom<CapacityStatsEntry[]>(store, adminCapacityStatsAtom(`${ALL_EVENT_TYPES_ID}|`))

    expect(mockGetAdminCapacityStats.mock.calls.map((call) => call[1])).toEqual(['NOME-B', 'NOWT', 'CUSTOM'])
    expect(result).toEqual([entry('NOME-B'), entry('NOWT'), entry('CUSTOM')])
  })

  it('passes an empty organizer through, meaning every organizer the caller belongs to', async () => {
    const store = storeWith(['NOME-B'])

    await resolveAtom(store, adminCapacityStatsAtom('NOME-B|'))

    expect(mockGetAdminCapacityStats).toHaveBeenCalledWith('token', 'NOME-B', '')
  })

  it('fetches nothing without an event type', async () => {
    const store = storeWith(['NOME-B'])

    await expect(resolveAtom(store, adminCapacityStatsAtom('|org1'))).resolves.toEqual([])
    expect(mockGetAdminCapacityStats).not.toHaveBeenCalled()
  })

  it('fetches nothing without a token, rather than calling the admin endpoint unauthenticated', async () => {
    const store = storeWith(['NOME-B'], null)

    await expect(resolveAtom(store, adminCapacityStatsAtom('NOME-B|org1'))).resolves.toEqual([])
    expect(mockGetAdminCapacityStats).not.toHaveBeenCalled()
  })
})
