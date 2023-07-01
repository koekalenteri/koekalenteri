import { parseISO } from 'date-fns'
import { AuditRecord, ConfirmedEvent, Registration, RegistrationGroupInfo } from 'koekalenteri-shared/model'

import { mockRegistrationData } from '../../__mockData__/registrations'

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

for (const reg of mockRegistrationData) {
  if (!mockRegistrations[reg.eventId]) {
    mockRegistrations[reg.eventId] = []
  }
  mockRegistrations[reg.eventId].push(reg)
}

export async function getRegistrations(eventId: string, token?: string, signal?: AbortSignal): Promise<Registration[]> {
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
  token?: string,
  signal?: AbortSignal
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

export const getRegistrationAuditTrail = async (
  eventId: string,
  id: string,
  token?: string,
  signal?: AbortSignal
): Promise<AuditRecord[] | undefined> => {
  return new Promise((resolve) => {
    process.nextTick(() => resolve([{ auditKey: 'somekey', timestamp: new Date(), message: 'example audit record' }]))
  })
}

export async function putRegistration(
  registration: Registration,
  token?: string,
  signal?: AbortSignal
): Promise<Registration> {
  throw new Error('not implemented')
}

export async function putRegistrationGroups(
  groups: RegistrationGroupInfo[],
  token?: string,
  signal?: AbortSignal
): Promise<Pick<ConfirmedEvent, 'classes' | 'entries'> & { items: Registration[] }> {
  throw new Error('not implemented')
}

export async function getStartList(eventId: string, token?: string, signal?: AbortSignal): Promise<Registration[]> {
  return new Promise((resolve, reject) => {
    const registrations = mockRegistrations[eventId]?.filter((r) => Boolean(r.group?.date))
    if (!registrations?.length) {
      reject()
    } else {
      process.nextTick(() => resolve(registrations))
    }
  })
}
