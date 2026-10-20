import type React from 'react'
import type { Registration, RegistrationGroupMove } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { createStore, useAtomValue, useSetAtom } from 'jotai'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { mockRegistrations } from '@/api/__mocks__/registration'
import { getRegistrations } from '@/api/registration'
import { idTokenAtom } from '@/pages/state'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
import { adminEventRegistrationsAtom, adminPendingRegistrationGroupMovesAtom } from './atoms'
import { adminEventPaymentLockedAtom, adminProjectedEventRegistrationsAtom } from './derivedAtoms'

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
