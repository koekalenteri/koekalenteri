import type React from 'react'
import type { Registration } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { useAtomValue, useSetAtom } from 'jotai'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { adminEventRegistrationsAtom, adminPendingRegistrationGroupMovesAtom } from './atoms'
import { adminProjectedEventRegistrationsAtom } from './derivedAtoms'

const eventId = registrationWithStaticDates.eventId
const HELSINKI_KEY = '2026-08-15-ap'

// A start stored with the UTC day of the Helsinki midnight (KOE-1541)
const start = (id: string, number: number, key: string): Registration => ({
  ...registrationWithStaticDates,
  class: 'AVO',
  group: { date: new Date('2026-08-14T21:00:00.000Z'), key, number, time: 'ap' },
  id,
})
const reserve: Registration = {
  ...registrationWithStaticDates,
  class: 'AVO',
  group: { key: 'reserve', number: 1 },
  id: 'c',
}
const move = { group: { date: new Date('2026-08-14T21:00:00.000Z'), key: HELSINKI_KEY, time: 'ap' as const }, id: 'c' }

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
