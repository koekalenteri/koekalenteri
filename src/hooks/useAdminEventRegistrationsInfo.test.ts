import type { Registration } from '../types'
import { renderHook } from '@testing-library/react'
import { eventWithStaticDates } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../lib/registration'
import useAdminEventRegistrationInfo from './useAdminEventRegistrationsInfo'

const entry = (id: string, overrides: Partial<Registration>): Registration => ({
  ...registrationWithStaticDates,
  cancelled: false,
  class: undefined,
  eventType: eventWithStaticDates.eventType,
  group: undefined,
  id,
  ...overrides,
})

describe('useAdminEventRegistrationInfo', () => {
  it('counts participants, reserve and cancelled entries per class by the starter rule', () => {
    const registrations = [
      entry('placed', { group: { key: 'NOU-ap', number: 1 } }),
      entry('reserve', { group: { key: GROUP_KEY_RESERVE, number: 1 } }),
      entry('ungrouped', {}),
      entry('cancelled', { cancelled: true, group: { key: GROUP_KEY_CANCELLED, number: 1 } }),
      entry('cancelled-after-placing', { cancelled: true, group: { key: 'NOU-ap', number: 2 } }),
    ]

    const { result } = renderHook(() =>
      useAdminEventRegistrationInfo({ ...eventWithStaticDates, places: 10 }, registrations)
    )

    expect(result.current.numbersByClass.NOU).toEqual({
      cancelled: 2,
      invalid: false,
      participants: 1,
      places: 10,
      reserve: 2,
      value: 10,
    })
    expect(result.current.selectedByClass.NOU?.map((registration) => registration.id)).toEqual(['placed'])
  })
})
