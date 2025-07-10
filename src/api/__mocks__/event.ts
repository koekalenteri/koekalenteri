import type { DogEvent, PublicDogEvent } from '../../types'

import { parseISO } from 'date-fns'

import { emptyEvent } from '../../__mockData__/emptyEvent'
import {
  eventWithEntryClosed,
  eventWithEntryClosing,
  eventWithEntryNotYetOpen,
  eventWithEntryOpen,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
  eventWithStaticDatesAndClass,
} from '../../__mockData__/events'
import { sanitizeDogEvent } from '../../lib/event'

export const mockEvents: DogEvent[] = [
  eventWithStaticDates,
  eventWithEntryClosed, // in between the static dates for simulating unordered api response
  eventWithStaticDatesAndClass,
  eventWithStaticDatesAnd3Classes,
  {
    ...emptyEvent,
    id: 'test2',
    organizer: {
      id: '2',
      name: 'Järjestäjä 2',
    },
    eventType: 'NOME-B',
    classes: [{ class: 'AVO', date: parseISO('2021-02-12') }],
    startDate: parseISO('2021-02-12'),
    endDate: parseISO('2021-02-13'),
    entryStartDate: parseISO('2021-02-01'),
    entryEndDate: parseISO('2021-02-12'),
    judges: [{ id: 223, name: 'Tuomari 2' }],
  },
  eventWithEntryOpen,
  eventWithEntryNotYetOpen,
  eventWithEntryClosing,
  eventWithParticipantsInvited,
]

export async function getEvents(_signal?: AbortSignal): Promise<PublicDogEvent[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockEvents.map((item) => sanitizeDogEvent(item))))
  })
}

export async function getAdminEvents(_signal?: AbortSignal): Promise<DogEvent[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve([...mockEvents]))
  })
}

export async function getEvent(id: string, _signal?: AbortSignal): Promise<DogEvent> {
  return new Promise((resolve, reject) => {
    const event = mockEvents.find((item) => item.id === id)
    process.nextTick(() => (event ? resolve(event) : reject(new Error('not found'))))
  })
}

export async function putEvent(event: DogEvent, _token?: string, _signal?: AbortSignal): Promise<DogEvent> {
  return new Promise((resolve, reject) => {
    let existing: DogEvent | undefined = event
    if (!event.id) {
      event.id = 'test' + (mockEvents.length + 1)
      mockEvents.push(event)
    } else {
      existing = mockEvents.find((e) => e.id === event.id)
      if (existing) {
        Object.assign(existing, event)
        existing.modifiedAt = new Date()
        existing.modifiedBy = 'mock'
      }
    }
    process.nextTick(() => (existing ? resolve(existing) : reject(new Error('not found'))))
  })
}

export async function putInvitationAttachment(
  _eventId: string,
  _file: File,
  _token?: string,
  _signal?: AbortSignal
): Promise<string> {
  return 'mock-file-id'
}
