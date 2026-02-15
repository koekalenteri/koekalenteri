import type { AuditRecord, ConfirmedEvent, Registration, RegistrationGroupInfo } from '../../types'
import { parseISO } from 'date-fns'
import { mockRegistrationData } from '../../__mockData__/registrations'
import { mockEvents } from './event'

export const mockRegistrations: { [key: string]: Registration[] } = {
  test2: [
    {
      agreeToTerms: true,
      breeder: {
        location: 'breeder location',
        name: 'breeder name',
      },
      // NOTE: Avoid `parseISO('YYYY-MM-DD')` (timezone-dependent). Use a stable instant.
      createdAt: parseISO('2021-02-01T12:00:00Z'),
      createdBy: 'some user',
      dates: [],
      dog: {
        name: 'dog name',
        regNo: 'dog reg',
        results: [],
      },
      eventId: 'test2',
      eventType: 'NOME-B',
      handler: {
        email: 'handler@e.mail',
        location: 'handler location',
        membership: false,
        name: 'handler name',
        phone: 'phone',
      },
      id: 'reg1',
      language: 'fi',
      modifiedAt: parseISO('2021-02-01T12:00:00Z'),
      modifiedBy: 'some user',
      notes: 'notes',
      owner: {
        email: 'owner@e.mail',
        location: 'owner location',
        membership: false,
        name: 'owner name',
        phone: 'owner phone',
      },
      payer: {
        email: 'payer@e.mail',
        name: 'payer name',
        phone: 'payer phone',
      },
      qualifyingResults: [],
      reserve: 'ANY',
    },
  ],
}

for (const reg of mockRegistrationData) {
  if (!mockRegistrations[reg.eventId]) {
    mockRegistrations[reg.eventId] = []
  }
  mockRegistrations[reg.eventId].push(reg)
}

export async function getRegistrations(
  eventId: string,
  _token?: string,
  _signal?: AbortSignal
): Promise<Registration[]> {
  return new Promise((resolve, reject) => {
    const event = mockEvents.find((item) => item.id === eventId)
    if (!event) {
      process.nextTick(() => reject(new Error(`event not found with id: ${eventId}`)))
    } else {
      process.nextTick(() => resolve(mockRegistrations[eventId] || []))
    }
  })
}

export async function getRegistration(
  eventId: string,
  id: string,
  _token?: string,
  _signal?: AbortSignal
): Promise<Registration | undefined> {
  return new Promise((resolve, reject) => {
    const registration = (mockRegistrations[eventId] || []).find((item) => item.id === id)
    if (!registration) {
      reject(new Error(`Registration not found ${eventId}/${id}`))
    } else {
      process.nextTick(() => resolve(registration))
    }
  })
}

export const getRegistrationAuditTrail = async (
  _eventId: string,
  _id: string,
  _token?: string,
  _signal?: AbortSignal
): Promise<AuditRecord[] | undefined> => {
  return new Promise((resolve) => {
    process.nextTick(() =>
      resolve([{ auditKey: 'somekey', message: 'example audit record', timestamp: new Date(), user: 'test user' }])
    )
  })
}

export async function putRegistration(
  registration: Registration,
  _token?: string,
  _signal?: AbortSignal
): Promise<Registration> {
  return Promise.resolve({ ...registration, id: 'test-registration' })
}

export async function putRegistrationGroups(
  _groups: RegistrationGroupInfo[],
  _token?: string,
  _signal?: AbortSignal
): Promise<Pick<ConfirmedEvent, 'classes' | 'entries'> & { items: Registration[] }> {
  throw new Error('not implemented')
}

export async function getStartList(eventId: string, _token?: string, _signal?: AbortSignal): Promise<Registration[]> {
  return new Promise((resolve, reject) => {
    const registrations = mockRegistrations[eventId]?.filter((r) => Boolean(r.group?.date))
    if (!registrations?.length) {
      reject(new Error('not found'))
    } else {
      process.nextTick(() => resolve(registrations))
    }
  })
}
