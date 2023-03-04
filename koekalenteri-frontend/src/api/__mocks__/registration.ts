import { parseISO } from 'date-fns'
import { Registration } from 'koekalenteri-shared/model'

import { mockEvents } from './event'

export const mockRegistrations: { [key: string]: Registration[] } = {
  test2: [
    {
      id: 'reg1',
      createdAt: parseISO('2021-02-01'),
      createdBy: 'some user',
      modifiedAt: parseISO('2021-02-01'),
      modifiedBy: 'some user',
      agreeToTerms: true,
      breeder: {
        name: 'breeder name',
        location: 'breeder location',
      },
      handler: {
        name: 'handler name',
        email: 'handler@e.mail',
        phone: 'phone',
        location: 'handler location',
        membership: false,
      },
      owner: {
        name: 'owner name',
        email: 'owner@e.mail',
        phone: 'owner phone',
        location: 'owner location',
        membership: false,
      },
      eventId: 'test2',
      eventType: 'NOME-B',
      dates: [],
      language: 'fi',
      notes: 'notes',
      dog: {
        name: 'dog name',
        regNo: 'dog reg',
        results: [],
      },
      qualifyingResults: [],
      reserve: 'ANY',
    },
  ],
}

export async function getRegistrations(eventId: string, _signal?: AbortSignal): Promise<Registration[]> {
  return new Promise((resolve, reject) => {
    const event = mockEvents.find((item) => item.id === eventId)
    if (!event) {
      reject()
    } else {
      process.nextTick(() => resolve(mockRegistrations[eventId] || []))
    }
  })
}

export async function getRegistration(
  eventId: string,
  id: string,
  _signal?: AbortSignal
): Promise<Registration | undefined> {
  return new Promise((resolve, reject) => {
    const registration = (mockRegistrations[eventId] || []).find((item) => item.id === id)
    if (!registration) {
      reject()
    } else {
      process.nextTick(() => resolve(registration))
    }
  })
}
