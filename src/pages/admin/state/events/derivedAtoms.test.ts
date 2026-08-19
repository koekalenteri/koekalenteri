import type { DogEvent } from '../../../../types'
import { createStore } from 'jotai'
import { emptyEvent } from '../../../../__mockData__/emptyEvent'
import { adminEventFilterTextAtom, adminEventsAtom, adminShowPastEventsAtom } from './atoms'
import { adminEventOrganizersAtom, adminFilteredEventsAtom } from './derivedAtoms'

const event = (id: string, endDate: Date): DogEvent => ({
  ...emptyEvent,
  endDate,
  id,
  name: `Tapahtuma ${id}`,
  startDate: endDate,
})

describe('admin event derived atoms', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000+03:00'))
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    vi.useRealTimers()
  })

  it('keeps events ending today visible when past events are hidden', async () => {
    const today = event('today', new Date('2026-05-28T00:00:00.000+03:00'))
    const yesterday = event('yesterday', new Date('2026-05-27T00:00:00.000+03:00'))

    const store = createStore()
    store.set(adminEventsAtom, [today, yesterday])
    store.set(adminEventFilterTextAtom, '')
    store.set(adminShowPastEventsAtom, false)

    await expect(store.get(adminFilteredEventsAtom)).resolves.toEqual([today])
  })

  it('ignores events with missing organizers when listing event organizers', async () => {
    const valid = {
      ...event('valid', new Date('2026-05-28T00:00:00.000+03:00')),
      organizer: { id: 'org-1', name: 'Organizer' },
    }
    const missingOrganizer = {
      ...event('missing-organizer', new Date('2026-05-28T00:00:00.000+03:00')),
      organizer: undefined,
    } as unknown as DogEvent

    const store = createStore()
    store.set(adminEventsAtom, [missingOrganizer, valid])

    await expect(store.get(adminEventOrganizersAtom)).resolves.toEqual([valid.organizer])
  })
})
