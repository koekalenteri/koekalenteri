import { parseISO } from 'date-fns'
import { Event } from 'koekalenteri-shared/model'

import { eventWithEntryClosing, eventWithEntryNotYetOpen, eventWithEntryOpen, eventWithStaticDates } from '../../__mockData__/events'
import { emptyEvent } from '../test-utils/emptyEvent'

export const mockEvents: Event[] = [
  eventWithStaticDates,
  {
    ...emptyEvent,
    id: 'test2',
    organizer: {
      id: 2,
      name: 'Test org',
    },
    eventType: 'NOME-B',
    classes: [{ class: 'AVO' }],
    startDate: parseISO('2021-02-12'),
    endDate: parseISO('2021-02-13'),
    entryStartDate: parseISO('2021-02-01'),
    entryEndDate: parseISO('2021-02-12'),
    judges: [223],
  },
  eventWithEntryOpen,
  eventWithEntryNotYetOpen,
  eventWithEntryClosing,
]

export async function getEvents(): Promise<Event[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockEvents))
  })
}

export async function getEvent(id: string): Promise<Event> {
  return new Promise((resolve, reject) => {
    const event = mockEvents.find(item => item.id === id)
    process.nextTick(() => event ? resolve(event) : reject())
  })
}

export async function putEvent(event: Event, token?: string): Promise<Event> {
  return new Promise((resolve, reject) => {
    let existing: Event|undefined = event
    if (!event.id) {
      event.id = 'test' + (mockEvents.length + 1)
      mockEvents.push(event)
    } else {
      existing = mockEvents.find(e => e.id === event.id)
      if (existing) {
        Object.assign(existing, event)
        existing.modifiedAt = new Date()
        existing.modifiedBy = 'mock'
      }
    }
    process.nextTick(() => existing ? resolve(existing) : reject())
  })
}
