import type { StartNumbersTime } from '../lib/event'
import type {
  AuditRecord,
  DogEvent,
  EventClass,
  EventCopyResult,
  EventKcIdChoice,
  InvitationAttachmentVersion,
  JsonAuditRecord,
  JsonDogEvent,
  JsonEventKcIdChoice,
  JsonInvitationAttachmentVersion,
  JsonPublicDogEvent,
  Patch,
  PublicDogEvent,
  RegistrationClass,
  Replace,
} from '../types'
import { addDays, nextSaturday } from 'date-fns'
import { zonedStartOfDay } from '../i18n/dates'
import { latestCollectionUpdate } from '../lib/incremental'
import {
  converter,
  recordOf,
  timestamp,
  toAuditRecord,
  toDogEvent,
  toDogEventWithLiveTurns,
  toEventKcIdChoice,
  toInvitationAttachmentVersion,
  toPublicDogEvent,
} from '../lib/wire'
import http, { withToken } from './http'

const PATH = '/event/'
const ADMIN_PATH = '/admin/event/'

type JsonPublicEventsDeltaResponse = {
  /** The server's watermark for the next incremental fetch (KOE-1501) */
  cursor?: number
  events: JsonPublicDogEvent[]
  /** The unchanged events' stamps, so a stale cached copy can be told from a current one (KOE-1501) */
  unchanged?: { id: string; updatedAt: string }[]
  unchangedIds: string[]
}

export type PublicEventsDeltaResponse = Replace<JsonPublicEventsDeltaResponse, 'events', PublicDogEvent[]>

type JsonPublicEventsResponse = JsonPublicDogEvent[] | JsonPublicEventsDeltaResponse

export type { EventKcIdChoice }

export type SearchEventKcIdChoicesResponse = {
  choices: EventKcIdChoice[]
}

export type SearchEventKcIdChoicesRequest = Pick<
  DogEvent,
  'classes' | 'endDate' | 'eventType' | 'location' | 'name' | 'startDate'
> & {
  classes: Pick<EventClass, 'class' | 'date'>[]
  organizer: Pick<DogEvent['organizer'], 'id'>
}

function isPublicEventsDeltaResponse(response: JsonPublicEventsResponse): response is JsonPublicEventsDeltaResponse {
  return !Array.isArray(response)
}

export const getEvents = async (
  start?: Date,
  end?: Date,
  since?: number,
  signal?: AbortSignal
): Promise<PublicEventsDeltaResponse> => {
  const params = new URLSearchParams()

  if (start) params.append('start', start.getTime().toString())
  if (end) params.append('end', end.getTime().toString())
  if (since) params.append('since', since.toString())

  const query = params.toString()
  const url = query ? `${PATH}?${query}` : PATH

  const response = await http.get<JsonPublicEventsResponse>(url, { signal })

  if (isPublicEventsDeltaResponse(response)) return { ...response, events: response.events.map(toPublicDogEvent) }

  // A full list carries no cursor of its own: the latest stamp among its events is what the
  // server would have computed for it.
  const events = response.map(toPublicDogEvent)
  return { cursor: latestCollectionUpdate(events)?.getTime(), events, unchangedIds: [] }
}

// The endpoint serves the sanitized public event, so the public-only `liveTurns` rides along.
export const getEvent = async (id: string, signal?: AbortSignal) =>
  toDogEventWithLiveTurns(
    await http.get<JsonDogEvent & Pick<JsonPublicDogEvent, 'liveTurns'>>(`${PATH}${id}`, { signal })
  )

export async function getAdminEvents(token?: string, lastModified?: number, signal?: AbortSignal): Promise<DogEvent[]> {
  const qs = lastModified ? `?since=${lastModified}` : ''
  return (await http.get<JsonDogEvent[]>(ADMIN_PATH + qs, withToken({ signal }, token))).map(toDogEvent)
}

export async function getAdminEvent(id: string, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  return toDogEvent(await http.get<JsonDogEvent>(`${ADMIN_PATH}${id}`, withToken({ signal }, token)))
}

export const getEventAuditTrail = async (
  id: string,
  token: string,
  signal?: AbortSignal
): Promise<AuditRecord[] | undefined> =>
  (await http.get<JsonAuditRecord[]>(`${ADMIN_PATH}audit/${id}`, withToken({ signal }, token))).map(toAuditRecord)

export async function putEvent(event: Patch<DogEvent>, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  const request = withToken({ signal }, token)
  const saved = event.id
    ? await http.patch<Patch<DogEvent>, JsonDogEvent>(ADMIN_PATH, event, request)
    : await http.post<Patch<DogEvent>, JsonDogEvent>(ADMIN_PATH, event, request)
  return toDogEvent(saved.data)
}

/** The event as the publishing endpoints answer with it. */
const toSavedEvent = converter<{ event: JsonDogEvent }, { event: DogEvent }>({ event: toDogEvent })

export interface StartNumbersRequest {
  eventClass?: RegistrationClass
  /** Publishing is also the freeze: the server snapshots each participant's current group. */
  published?: boolean
  /** One day (yyyy-MM-dd) of a multi-day class, for a publish or hide that leaves the other days alone (KOE-1304). */
  date?: string
  /** One half of that day — the morning or the afternoon a trial draws separately (KOE-1430). */
  time?: StartNumbersTime
  numbers?: { id: string; startNumber: number }[]
}

/** The one endpoint that writes start numbers (KOE-1017, KOE-1218). */
export async function putStartNumbers(
  eventId: string,
  request: StartNumbersRequest,
  token?: string,
  signal?: AbortSignal
): Promise<{ event: DogEvent }> {
  return toSavedEvent(
    await http.put<StartNumbersRequest, { event: JsonDogEvent }>(
      `/admin/startnumbers/${eventId}`,
      request,
      withToken({ signal }, token)
    )
  )
}

export interface ResultsPublishedRequest {
  /** The class whose day changes; absent for a classless event. */
  eventClass?: RegistrationClass
  /** The one day (yyyy-MM-dd) published or hidden; the others stay as they are (KOE-1510). */
  date: string
  published: boolean
}

/** The one endpoint that publishes or hides results, a day at a time (KOE-1510). */
export async function putResultsPublished(
  eventId: string,
  request: ResultsPublishedRequest,
  token?: string,
  signal?: AbortSignal
): Promise<{ event: DogEvent }> {
  return toSavedEvent(
    await http.put<ResultsPublishedRequest, { event: JsonDogEvent }>(
      `/admin/results-published/${eventId}`,
      request,
      withToken({ signal }, token)
    )
  )
}

/** A one-day trial may come from Kennelliitto with the year 1 for its end: the end is the start then. */
const normalizeEventKcIdChoice = (choice: EventKcIdChoice): EventKcIdChoice =>
  choice.endDate.getFullYear() <= 1 ? { ...choice, endDate: choice.startDate } : choice

export async function searchEventKcIdChoices(
  request: SearchEventKcIdChoicesRequest,
  token?: string,
  signal?: AbortSignal
): Promise<SearchEventKcIdChoicesResponse> {
  const response = (
    await http.post<SearchEventKcIdChoicesRequest, { choices: JsonEventKcIdChoice[] }>(
      `${ADMIN_PATH}kcId/choices`,
      request,
      withToken({ signal }, token)
    )
  ).data

  return { ...response, choices: response.choices.map((choice) => normalizeEventKcIdChoice(toEventKcIdChoice(choice))) }
}

type JsonInvitationAttachmentResponse = {
  invitationAttachmentHistory: Record<string, JsonInvitationAttachmentVersion>
  key: string
  uploadedAt: string
}
type InvitationAttachmentResponse = {
  invitationAttachmentHistory: Record<string, InvitationAttachmentVersion>
  key: string
  uploadedAt: Date
}
const toInvitationAttachmentResponse = converter<JsonInvitationAttachmentResponse, InvitationAttachmentResponse>({
  invitationAttachmentHistory: recordOf(toInvitationAttachmentVersion),
  uploadedAt: timestamp,
})

export async function putInvitationAttachment(
  eventId: string,
  file: File,
  className?: string,
  token?: string,
  signal?: AbortSignal
): Promise<InvitationAttachmentResponse> {
  const data = new FormData()
  data.append('file', file, file.name)

  const path = className
    ? `/admin/file/invitation/${eventId}/${encodeURIComponent(className)}`
    : `/admin/file/invitation/${eventId}`

  return toInvitationAttachmentResponse(
    await http.postRaw<FormData, JsonInvitationAttachmentResponse>(path, data, withToken({ signal }, token))
  )
}

/** Copies the event with its registrations into another environment, every person in it replaced (KOE-1471). */
export async function exportEventToStage(eventId: string, target: string, token?: string, signal?: AbortSignal) {
  return (
    await http.post<{ eventId: string; target: string }, EventCopyResult>(
      `${ADMIN_PATH}export`,
      { eventId, target },
      withToken({ signal }, token)
    )
  ).data
}

export async function copyEventWithRegistrations(eventId: string, token?: string, signal?: AbortSignal) {
  return toDogEvent(
    (
      await http.post<{ id: string; startDate: Date }, JsonDogEvent>(
        `${ADMIN_PATH}copy`,
        { id: eventId, startDate: zonedStartOfDay(nextSaturday(addDays(Date.now(), 90))) },
        withToken({ signal }, token)
      )
    ).data
  )
}
