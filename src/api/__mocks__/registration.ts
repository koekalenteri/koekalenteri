import type {
  AuditRecord,
  ConfirmedEvent,
  EventResult,
  Registration,
  RegistrationCreateRequest,
  RegistrationGroupMove,
  RegistrationPatchRequest,
} from '../../types'
import type { EventResultSubmission, EventResultsResponse } from '../registration'
import { parseISO } from 'date-fns'
import { mockRegistrationData } from '../../__mockData__/registrations'
import { applyPatchOperations } from '../../lib/patch'
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
  _editToken?: string,
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

export async function postRegistration(
  registration: RegistrationCreateRequest,
  _signal?: AbortSignal
): Promise<Registration> {
  const id = registration.id || 'test-registration'
  return Promise.resolve({ ...registration, id })
}

export async function patchRegistration(
  request: RegistrationPatchRequest,
  _editToken?: string,
  _signal?: AbortSignal
): Promise<Registration> {
  const registration = mockRegistrations[request.eventId]?.find((item) => item.id === request.id)
  if (!registration) throw new Error(`Registration not found ${request.eventId}/${request.id}`)
  return applyPatchOperations(registration, request.operations)
}

export async function postAdminRegistration(
  registration: RegistrationCreateRequest,
  _token: string,
  _signal?: AbortSignal
): Promise<Registration> {
  return Promise.resolve({ ...registration })
}

export async function patchAdminRegistration(
  request: RegistrationPatchRequest,
  _token: string,
  _signal?: AbortSignal
): Promise<Registration> {
  return patchRegistration(request)
}

export const putAdminRegistrationNotes = vi.fn(
  async (
    _registration: Pick<Registration, 'eventId' | 'id' | 'internalNotes'>,
    _token: string,
    _signal?: AbortSignal
  ): Promise<void> => undefined
)

export async function putRegistrationGroups(
  _eventId: string,
  _moves: RegistrationGroupMove[],
  _token: string,
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

export const getStartListPreview = vi.fn(
  async (eventId: string, _token: string, _signal?: AbortSignal): Promise<Registration[]> => getStartList(eventId)
)

/**
 * Saving results. A vi.fn so a test can make the save conflict or fail; the default answer says every
 * submission was written, which is what the page needs to report a successful save.
 */
export const putEventResults = vi.fn(
  async (
    _eventId: string,
    results: EventResultSubmission[],
    _token: string,
    _signal?: AbortSignal
  ): Promise<EventResultsResponse> => ({
    conflicts: [],
    saved: results.map(({ id }) => ({ eventResult: {} as EventResult, id })),
    unchanged: [],
  })
)
