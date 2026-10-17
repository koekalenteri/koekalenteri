import type { KcPreviewResponse, KcSendResponse } from '../lib/kennelliittoResults'
import type { SubmittedEventResult, SubmittedTask } from '../lib/results'
import type {
  AuditRecord,
  CollectionResponse,
  ConfirmedEvent,
  EventResultsResponse,
  IncrementalCollectionResponse,
  JsonAuditRecord,
  JsonConfirmedEvent,
  JsonEventResultsResponse,
  JsonPublicRegistration,
  JsonRegistration,
  JsonTransaction,
  PublicRegistration,
  PublicStartList,
  Registration,
  RegistrationCreateRequest,
  RegistrationGroupMove,
  RegistrationPatchRequest,
  StoredEventResult,
  Transaction,
} from '../types'
import { startListVersionOf } from '../lib/startList'
import {
  arrayOf,
  converter,
  toAuditRecord,
  toCollection,
  toEventClass,
  toEventResultsResponse,
  toPublicRegistration,
  toRegistration,
  toTransaction,
} from '../lib/wire'
import http, { withRegistrationAuth, withToken, withUserRouteFallback } from './http'

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

  return toCollection(
    await http.get<CollectionResponse<JsonRegistration>>(
      `/admin/registration/${eventId}${query}`,
      withToken({ signal }, token)
    ),
    toRegistration
  )
}

export async function getRegistration(
  eventId: string,
  id: string,
  editToken?: string,
  signal?: AbortSignal
): Promise<Registration | undefined> {
  return toRegistration(
    await http.get<JsonRegistration>(`/registration/${eventId}/${id}`, withToken({ signal }, editToken))
  )
}

export const getRegistrationAuditTrail = async (
  eventId: string,
  id: string,
  token: string,
  signal?: AbortSignal
): Promise<AuditRecord[] | undefined> =>
  (await http.get<JsonAuditRecord[]>(`/admin/registration/audit/${eventId}/${id}`, withToken({ signal }, token))).map(
    toAuditRecord
  )

/** The participant's registration route: the logged-in one names them in the audit trail (KOE-1418). */
const registrationPath = (idToken?: string) => (idToken ? '/user/registration/' : '/registration/')

export async function postRegistration(
  registration: RegistrationCreateRequest,
  idToken?: string,
  signal?: AbortSignal
): Promise<Registration> {
  return withUserRouteFallback(idToken, async (token) =>
    toRegistration(
      (
        await http.post<RegistrationCreateRequest, JsonRegistration>(
          registrationPath(token),
          registration,
          withRegistrationAuth({ signal }, undefined, token)
        )
      ).data
    )
  )
}

export async function patchRegistration(
  registration: RegistrationPatchRequest,
  editToken?: string,
  idToken?: string,
  signal?: AbortSignal
): Promise<Registration> {
  return withUserRouteFallback(idToken, async (token) =>
    toRegistration(
      (
        await http.patch<RegistrationPatchRequest, JsonRegistration>(
          registrationPath(token),
          registration,
          withRegistrationAuth({ signal }, editToken, token)
        )
      ).data
    )
  )
}

export async function postAdminRegistration(
  registration: RegistrationCreateRequest,
  token: string,
  signal?: AbortSignal
): Promise<Registration> {
  return toRegistration(
    (
      await http.post<RegistrationCreateRequest, JsonRegistration>(
        '/admin/registration/',
        registration,
        withToken({ signal }, token)
      )
    ).data
  )
}

export async function patchAdminRegistration(
  registration: RegistrationPatchRequest,
  token: string,
  signal?: AbortSignal
): Promise<Registration> {
  return toRegistration(
    (
      await http.patch<RegistrationPatchRequest, JsonRegistration>(
        '/admin/registration/',
        registration,
        withToken({ signal }, token)
      )
    ).data
  )
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

type JsonRegistrationGroupResponse = Pick<JsonConfirmedEvent, 'classes' | 'entries'> & {
  items: JsonRegistration[]
  invitedOk: string[]
  invitedFailed: string[]
  invitationAwaitingPayment?: string[]
  pickedOk: string[]
  pickedFailed: string[]
  reserveOk: string[]
  reserveFailed: string[]
  cancelledOk: string[]
  cancelledFailed: string[]
}

type RegistrationGroupResponse = Pick<ConfirmedEvent, 'classes' | 'entries'> & {
  items: Registration[]
  invitedOk: string[]
  invitedFailed: string[]
  /** Lifted from the reserve list into an invited class, but the place is not paid for yet. */
  invitationAwaitingPayment?: string[]
  pickedOk: string[]
  pickedFailed: string[]
  reserveOk: string[]
  reserveFailed: string[]
  cancelledOk: string[]
  cancelledFailed: string[]
}

const toRegistrationGroupResponse = converter<JsonRegistrationGroupResponse, RegistrationGroupResponse>({
  classes: arrayOf(toEventClass),
  items: arrayOf(toRegistration),
})

export async function putRegistrationGroups(
  eventId: string,
  groups: RegistrationGroupMove[],
  token: string,
  signal?: AbortSignal
): Promise<RegistrationGroupResponse> {
  return toRegistrationGroupResponse(
    (
      await http.post<RegistrationGroupMove[], JsonRegistrationGroupResponse>(
        `/admin/reg-groups/${eventId}`,
        groups,
        withToken({ signal }, token)
      )
    ).data
  )
}

export async function getStartList(eventId: string, token?: string, signal?: AbortSignal): Promise<PublicStartList> {
  const { data, headers } = await http.getWithHeaders<JsonPublicRegistration[]>(
    `/startlist/${eventId}`,
    withToken({ signal }, token)
  )
  return { participants: data.map(toPublicRegistration), version: startListVersionOf(headers) }
}

export async function getStartListPreview(
  eventId: string,
  token: string,
  signal?: AbortSignal
): Promise<PublicRegistration[]> {
  return (await http.get<JsonPublicRegistration[]>(`/admin/startlist/${eventId}`, withToken({ signal }, token))).map(
    toPublicRegistration
  )
}

export const getRegistrationTransactions = async (
  eventId: string,
  id: string,
  token: string,
  signal?: AbortSignal
): Promise<Transaction[] | undefined> =>
  (
    await http.get<JsonTransaction[]>(`/admin/registration/transactions/${eventId}/${id}`, withToken({ signal }, token))
  ).map(toTransaction)

/** One dog's result as entered. Totals are derived on the server, never sent. */
export interface EventResultSubmission {
  id: string
  /** Tasks go up without provenance: the server assigns it, since it decides what a competing edit is. */
  eventResult: Omit<SubmittedEventResult, 'tasks'> & { tasks?: SubmittedTask[] }
  /** Scopes the submission to one post, so a parallel post's scores are merged rather than replaced. */
  stationId?: string
  /** The version this edit was made against: the post's own when scoped, the whole result otherwise. */
  basedOn?: string | Date
}

export type { EventResultsResponse, StoredEventResult }

export async function putEventResults(
  eventId: string,
  results: EventResultSubmission[],
  token: string,
  signal?: AbortSignal
): Promise<EventResultsResponse> {
  return toEventResultsResponse(
    (
      await http.post<EventResultSubmission[], JsonEventResultsResponse>(
        `/admin/event-results/${eventId}`,
        results,
        withToken({ signal }, token)
      )
    ).data
  )
}

type KennelliittoRequest =
  | { action: 'handOver'; withoutBlocked?: boolean }
  | { action: 'preview'; registrationIds?: string[] }
  | { action: 'send'; force?: boolean; registrationIds: string[] }

const kennelliittoResults = async <R>(
  eventId: string,
  request: KennelliittoRequest,
  token: string,
  signal?: AbortSignal
): Promise<R> =>
  (
    await http.post<KennelliittoRequest, R>(
      `/admin/event-results/${eventId}/kennelliitto`,
      request,
      withToken({ signal }, token)
    )
  ).data

/** What sending would do, without sending: the dialog's list. A write to Kennelliitto it is not. */
export const previewKennelliittoResults = (
  eventId: string,
  registrationIds: string[] | undefined,
  token: string,
  signal?: AbortSignal
) => kennelliittoResults<KcPreviewResponse>(eventId, { action: 'preview', registrationIds }, token, signal)

/** At most ten dogs at a time; the server refuses more. */
export const sendKennelliittoResults = (
  eventId: string,
  registrationIds: string[],
  force: boolean,
  token: string,
  signal?: AbortSignal
) => kennelliittoResults<KcSendResponse>(eventId, { action: 'send', force, registrationIds }, token, signal)

export const handOverKennelliittoResults = (
  eventId: string,
  withoutBlocked: boolean,
  token: string,
  signal?: AbortSignal
) => kennelliittoResults<{ handedOver: boolean }>(eventId, { action: 'handOver', withoutBlocked }, token, signal)
