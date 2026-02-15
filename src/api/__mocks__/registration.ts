import type { AuditRecord, ConfirmedEvent, Registration, RegistrationGroupInfo } from '../../types'

import { parseISO } from 'date-fns'

import { mockRegistrationData } from '../../__mockData__/registrations'

import { mockEvents } from './event'

export const mockRegistrations: { [key: string]: Registration[] } = {
  test2: [
    {
      id: 'reg1',
      // NOTE: Avoid `parseISO('YYYY-MM-DD')` (timezone-dependent). Use a stable instant.
      createdAt: parseISO('2021-02-01T12:00:00Z'),
      createdBy: 'some user',
      modifiedAt: parseISO('2021-02-01T12:00:00Z'),
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
      payer: {
        name: 'payer name',
        email: 'payer@e.mail',
        phone: 'payer phone',
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
      resolve([{ auditKey: 'somekey', timestamp: new Date(), user: 'test user', message: 'example audit record' }])
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
