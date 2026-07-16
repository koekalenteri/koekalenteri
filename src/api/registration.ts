import type {
  AuditRecord,
  CollectionResponse,
  ConfirmedEvent,
  IncrementalCollectionResponse,
  Patch,
  PublicRegistration,
  Registration,
  RegistrationGroupInfo,
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
  token?: string,
  signal?: AbortSignal
): Promise<Registration | undefined> {
  return http.get<Registration>(`/registration/${eventId}/${id}`, withToken({ signal }, token))
}

export const getRegistrationAuditTrail = async (
  eventId: string,
  id: string,
  token: string,
  signal?: AbortSignal
): Promise<AuditRecord[] | undefined> =>
  http.get<AuditRecord[]>(`/admin/registration/audit/${eventId}/${id}`, withToken({ signal }, token))

export async function putRegistration(
  registration: Patch<Registration>,
  token?: string,
  signal?: AbortSignal
): Promise<Registration> {
  const request = withToken({ signal }, token)
  return registration.id
    ? (await http.patch<Patch<Registration>, Registration>('/registration/', registration, request)).data
    : (await http.post<Patch<Registration>, Registration>('/registration/', registration, request)).data
}

export async function putAdminRegistration(
  registration: Patch<Registration>,
  token: string,
  signal?: AbortSignal
): Promise<Registration> {
  const request = withToken({ signal }, token)
  return registration.id
    ? (await http.patch<Patch<Registration>, Registration>('/admin/registration/', registration, request)).data
    : (await http.post<Patch<Registration>, Registration>('/admin/registration/', registration, request)).data
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
  groups: RegistrationGroupInfo[],
  token: string,
  signal?: AbortSignal
): Promise<RegistrationGroupResponse> {
  return (
    await http.post<RegistrationGroupInfo[], RegistrationGroupResponse>(
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
