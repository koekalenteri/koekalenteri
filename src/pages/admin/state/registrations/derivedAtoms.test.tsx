import type React from 'react'
import type { DogEvent, Registration, RegistrationGroupMove } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { createStore, useAtomValue, useSetAtom } from 'jotai'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { mockRegistrations } from '@/api/__mocks__/registration'
import { getRegistrations } from '@/api/registration'
import { idTokenAtom } from '@/pages/state'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
import { adminEventsAtom } from '../events/atoms'
import { adminEventRegistrationsAtom, adminPendingRegistrationGroupMovesAtom } from './atoms'
import {
  adminEventEnteredClassesAtom,
  adminEventOfficialFormatLockedAtom,
  adminEventPaymentLockedAtom,
  adminProjectedEventRegistrationsAtom,
  placementKey,
} from './derivedAtoms'

vi.mock('@/api/registration')

const eventId = registrationWithStaticDates.eventId
const HELSINKI_KEY = '2026-08-15-ap'

// A start stored with the UTC day of the Helsinki midnight (KOE-1541)
const start = (id: string, number: number, key: string): Registration => ({
  ...registrationWithStaticDates,
  class: 'AVO',
  group: { date: '2026-08-15', key, number, time: 'ap' },
  id,
})
const reserve: Registration = {
  ...registrationWithStaticDates,
  class: 'AVO',
  group: { key: 'reserve', number: 1 },
  id: 'c',
}
const move: RegistrationGroupMove = { group: { date: '2026-08-15', key: HELSINKI_KEY, time: 'ap' }, id: 'c' }

describe('adminProjectedEventRegistrationsAtom', () => {
  it('keeps the server row of an unmoved start whose key only differs in spelling from the projection', () => {
    const stale = [start('a', 1, '2026-08-14-ap'), reserve]
    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <Provider
        initializeState={({ set }) => {
          // The projection numbers the groups by the event's format (KOE-1718), so the event is loaded too.
          set(adminEventsAtom, [{ ...eventWithStaticDates, id: eventId }])
          set(adminEventRegistrationsAtom(eventId), stale)
          set(adminPendingRegistrationGroupMovesAtom(eventId), [move])
        }}
      >
        {children}
      </Provider>
    )
    const { result } = renderHook(
      () => ({
        base: useAtomValue(adminEventRegistrationsAtom(eventId)),
        set: useSetAtom(adminProjectedEventRegistrationsAtom(eventId)),
      }),
      { wrapper }
    )

    // The server has repaired the key and placed the dog, as the pending move asks
    const healed = [start('a', 1, HELSINKI_KEY), { ...reserve, group: { ...move.group, number: 2 } }]
    act(() => result.current.set(healed))

    const base = result.current.base
    expect(Array.isArray(base) && base.find((registration) => registration.id === 'a')?.group?.key).toBe(HELSINKI_KEY)
  })
})

describe('placementKey', () => {
  const placed = start('a', 1, HELSINKI_KEY)

  it('reads a start whose key only differs in spelling as the same placement', () => {
    expect(placementKey(start('a', 1, '2026-08-14-ap'))).toBe(placementKey(placed))
  })

  // A group without a time keeps the key it has, so the day alone tells the two apart (KOE-1547).
  it('reads a group moved to another day as another placement', () => {
    const untimed: Registration = { ...placed, group: { date: '2026-08-15', key: 'day', number: 1 } }
    const nextDay: Registration = { ...placed, group: { date: '2026-08-16', key: 'day', number: 1 } }
    expect(placementKey(nextDay)).not.toBe(placementKey(untimed))
  })

  it('reads a cancelled registration as another placement', () => {
    expect(placementKey({ ...placed, cancelled: true })).not.toBe(placementKey(placed))
  })
})

// KOE-1568: the form's lock reads the list while it is still loading, by the rule PutEvent refuses with.
describe('adminEventPaymentLockedAtom', () => {
  const stored = mockRegistrations[eventId]
  afterEach(() => {
    mockRegistrations[eventId] = stored
  })

  it.each<[string, boolean, Registration[]]>([
    ['a completed registration', true, [{ ...registrationWithStaticDates, state: 'ready' }]],
    ['only one waiting for its payment', false, [{ ...registrationWithStaticDates, state: 'creating' }]],
    ['no registrations', false, []],
  ])('resolves the loading list with %s to %s', async (_name, expected, registrations) => {
    mockRegistrations[eventId] = registrations
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)

    const locked = store.get(adminEventPaymentLockedAtom(eventId))

    expect(locked).toBeInstanceOf(Promise)
    await expect(locked).resolves.toBe(expected)
  })

  it('locks nothing, and fetches nothing, for an event not yet saved', () => {
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)

    expect(store.get(adminEventPaymentLockedAtom(''))).toBe(false)
    expect(getRegistrations).not.toHaveBeenCalled()
  })
})

// KOE-674: PutEvent keeps a class a registration holds, a cancelled one too.
describe('adminEventEnteredClassesAtom', () => {
  const stored = mockRegistrations[eventId]
  afterEach(() => {
    mockRegistrations[eventId] = stored
  })

  it("names each class the event's registrations are in once, a cancelled one's too", async () => {
    mockRegistrations[eventId] = [
      { ...registrationWithStaticDates, class: 'ALO', id: 'a' },
      { ...registrationWithStaticDates, cancelled: true, class: 'AVO', id: 'b' },
      { ...registrationWithStaticDates, class: 'ALO', id: 'c' },
    ]
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)

    await expect(store.get(adminEventEnteredClassesAtom(eventId))).resolves.toEqual(['ALO', 'AVO'])
  })

  it('names none, and fetches nothing, for an event not yet saved', () => {
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)

    expect(store.get(adminEventEnteredClassesAtom(''))).toEqual([])
    expect(getRegistrations).not.toHaveBeenCalled()
  })
})

describe('adminEventOfficialFormatLockedAtom (KOE-1718)', () => {
  const stored = mockRegistrations[eventId]
  afterEach(() => {
    mockRegistrations[eventId] = stored
  })
  const turn = {
    dogs: [],
    id: 'turn-1',
    registrationIds: ['a'],
    startedAt: new Date('2026-08-15T08:00:00Z'),
    stationId: '1',
  }
  const result = { result: 'NOU1', updatedAt: new Date('2026-08-15T09:00:00Z'), updatedBy: 'Sihteeri' }

  it.each<[string, boolean, Partial<DogEvent>, Registration[]]>([
    ['nothing recorded', false, {}, [registrationWithStaticDates]],
    ['a saved result', true, {}, [{ ...registrationWithStaticDates, eventResult: result }]],
    ['a turn a post ran', true, { turns: [turn] }, []],
  ])('resolves an event with %s to %s', async (_name, expected, eventFields, registrations) => {
    mockRegistrations[eventId] = registrations
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)
    store.set(adminEventsAtom, [{ ...eventWithStaticDates, id: eventId, ...eventFields }])

    await expect(Promise.resolve(store.get(adminEventOfficialFormatLockedAtom(eventId)))).resolves.toBe(expected)
  })

  it('locks nothing for an event not yet saved', () => {
    expect(createStore().get(adminEventOfficialFormatLockedAtom(''))).toBe(false)
  })
})
