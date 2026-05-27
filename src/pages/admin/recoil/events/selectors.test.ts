import type { DogEvent } from '../../../../types'
import { snapshot_UNSTABLE } from 'recoil'
import { emptyEvent } from '../../../../__mockData__/emptyEvent'
import { adminEventFilterTextAtom, adminEventsAtom, adminShowPastEventsAtom } from './atoms'
import { adminFilteredEventsSelector } from './selectors'

const event = (id: string, endDate: Date): DogEvent => ({
  ...emptyEvent,
  endDate,
  id,
  name: `Tapahtuma ${id}`,
  startDate: endDate,
})

describe('admin event selectors', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-28T12:00:00.000+03:00'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('keeps events ending today visible when past events are hidden', () => {
    const today = event('today', new Date('2026-05-28T00:00:00.000+03:00'))
    const yesterday = event('yesterday', new Date('2026-05-27T00:00:00.000+03:00'))

    const snapshot = snapshot_UNSTABLE(({ set }) => {
      set(adminEventsAtom, [today, yesterday])
      set(adminEventFilterTextAtom, '')
      set(adminShowPastEventsAtom, false)
    })

    expect(snapshot.getLoadable(adminFilteredEventsSelector).valueOrThrow()).toEqual([today])
  })
})
