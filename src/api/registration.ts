import type { SubmittedEventResult, SubmittedTask } from '../lib/results'
import type {
  AuditRecord,
  CollectionResponse,
  ConfirmedEvent,
  EventResult,
  IncrementalCollectionResponse,
  PublicRegistration,
  Registration,
  RegistrationCreateRequest,
  RegistrationGroupMove,
  RegistrationPatchRequest,
  Transaction,
} from '../types'
import http, { withToken } from './http'

export async function getRegistrations(eventId: string, token: string, signal?: AbortSignal): Promise<Registration[]>
export async function getRegistrations(
  eventId: string,
  token: string,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<Registration>>
export async function getRegistrations(
  eventId: string,
  token: string,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<Registration>> {
  const query = since ? `?since=${since.getTime()}` : ''

  return http.get<CollectionResponse<Registration>>(
    `/admin/registration/${eventId}${query}`,
    withToken({ signal }, token)
  )
}

export async function getRegistration(
  eventId: string,
  id: string,
  editToken?: string,
  signal?: AbortSignal
): Promise<Registration | undefined> {
  return http.get<Registration>(`/registration/${eventId}/${id}`, withToken({ signal }, editToken))
}

export const getRegistrationAuditTrail = async (
  eventId: string,
  id: string,
  token: string,
  signal?: AbortSignal
): Promise<AuditRecord[] | undefined> =>
  http.get<AuditRecord[]>(`/admin/registration/audit/${eventId}/${id}`, withToken({ signal }, token))

export async function postRegistration(
  registration: RegistrationCreateRequest,
  signal?: AbortSignal
): Promise<Registration> {
  return (await http.post<RegistrationCreateRequest, Registration>('/registration/', registration, { signal })).data
}

export async function patchRegistration(
  registration: RegistrationPatchRequest,
  editToken?: string,
  signal?: AbortSignal
): Promise<Registration> {
  return (
    await http.patch<RegistrationPatchRequest, Registration>(
      '/registration/',
      registration,
      withToken({ signal }, editToken)
    )
  ).data
}

export async function postAdminRegistration(
  registration: RegistrationCreateRequest,
  token: string,
  signal?: AbortSignal
): Promise<Registration> {
  return (
    await http.post<RegistrationCreateRequest, Registration>(
      '/admin/registration/',
      registration,
      withToken({ signal }, token)
    )
  ).data
}

export async function patchAdminRegistration(
  registration: RegistrationPatchRequest,
  token: string,
  signal?: AbortSignal
): Promise<Registration> {
  return (
    await http.patch<RegistrationPatchRequest, Registration>(
      '/admin/registration/',
      registration,
      withToken({ signal }, token)
    )
  ).data
}

type RegistrationInternalNotes = Pick<Registration, 'eventId' | 'id' | 'internalNotes'>
export async function putAdminRegistrationNotes(
  registration: RegistrationInternalNotes,
  token: string,
  signal?: AbortSignal
): Promise<void> {
  return (
    await http.post<RegistrationInternalNotes, void>(
      '/admin/registration/note',
      registration,
      withToken({ signal }, token)
    )
  ).data
}

type RegistrationGroupResponse = Pick<ConfirmedEvent, 'classes' | 'entries'> & {
  items: Registration[]
  invitedOk: string[]
  invitedFailed: string[]
  pickedOk: string[]
  pickedFailed: string[]
  reserveOk: string[]
  reserveFailed: string[]
  cancelledOk: string[]
  cancelledFailed: string[]
}

export async function putRegistrationGroups(
  eventId: string,
  groups: RegistrationGroupMove[],
  token: string,
  signal?: AbortSignal
): Promise<RegistrationGroupResponse> {
  return (
    await http.post<RegistrationGroupMove[], RegistrationGroupResponse>(
      `/admin/reg-groups/${eventId}`,
      groups,
      withToken({ signal }, token)
    )
  ).data
}

export async function getStartList(
  eventId: string,
  token?: string,
  signal?: AbortSignal
): Promise<PublicRegistration[]> {
  return http.get<PublicRegistration[]>(`/startlist/${eventId}`, withToken({ signal }, token))
}

export async function getStartListPreview(
  eventId: string,
  token: string,
  signal?: AbortSignal
): Promise<PublicRegistration[]> {
  return http.get<PublicRegistration[]>(`/admin/startlist/${eventId}`, withToken({ signal }, token))
}

export const getRegistrationTransactions = async (
  eventId: string,
  id: string,
  token: string,
  signal?: AbortSignal
): Promise<Transaction[] | undefined> =>
  http.get<Transaction[]>(`/admin/registration/transactions/${eventId}/${id}`, withToken({ signal }, token))

/** One dog's result as entered. Totals are derived on the server, never sent. */
interface EventResultSubmission {
  id: string
  /** Tasks go up without provenance: the server assigns it, since it decides what a competing edit is. */
  eventResult: Omit<SubmittedEventResult, 'tasks'> & { tasks?: SubmittedTask[] }
  /** Scopes the submission to one post, so a parallel post's scores are merged rather than replaced. */
  stationId?: string
  /** The version this edit was made against: the post's own when scoped, the whole result otherwise. */
  basedOn?: string | Date
}

interface StoredEventResult {
  id: string
  eventResult: EventResult
}

interface EventResultsResponse {
  saved: StoredEventResult[]
  /** Already stored — what a retry over a bad connection gets back. */
  unchanged: StoredEventResult[]
  conflicts: { id: string; stationId?: string; stored: EventResult; submitted: EventResult }[]
}

export async function putEventResults(
  eventId: string,
  results: EventResultSubmission[],
  token: string,
  signal?: AbortSignal
): Promise<EventResultsResponse> {
  return (
    await http.post<EventResultSubmission[], EventResultsResponse>(
      `/admin/event-results/${eventId}`,
      results,
      withToken({ signal }, token)
    )
  ).data
}
