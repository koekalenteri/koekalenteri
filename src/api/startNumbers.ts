import type { ClassStartNumbers, RegistrationGroup } from '../types'
import http, { withToken } from './http'

/** What a save changed: the dog's frozen placement, or null where a cancelled holder yielded it. */
export interface StartNumberPatch {
  id: string
  startGroup?: RegistrationGroup | null
}

/** One drawn number, the way both number entry screens send it. */
export interface StartNumberEntry {
  id: string
  startNumber: number
}

const classPath = (eventId: string, eventClass: string) => `/start-numbers/${eventId}/${encodeURIComponent(eventClass)}`

/**
 * The class secretary's draw sheet (KOE-1267), authorized by the class's own link token instead of a
 * login: one class of the trial and the dogs that run in it.
 */
export async function getClassStartNumbers(
  eventId: string,
  eventClass: string,
  token: string,
  signal?: AbortSignal
): Promise<ClassStartNumbers> {
  return http.get<ClassStartNumbers>(classPath(eventId, eventClass), withToken({ signal }, token))
}

export async function putClassStartNumbers(
  eventId: string,
  eventClass: string,
  numbers: StartNumberEntry[],
  token: string,
  signal?: AbortSignal
): Promise<{ patches: StartNumberPatch[] }> {
  return (
    await http.post<{ numbers: StartNumberEntry[] }, { patches: StartNumberPatch[] }>(
      classPath(eventId, eventClass),
      { numbers },
      withToken({ signal }, token)
    )
  ).data
}

/** The token behind a class's draw link; the event secretary's side of the same mechanism. */
export async function getStartNumberLink(
  eventId: string,
  eventClass: string,
  token: string,
  signal?: AbortSignal
): Promise<{ token: string }> {
  return http.get<{ token: string }>(
    `/admin/start-numbers-link/${eventId}/${encodeURIComponent(eventClass)}`,
    withToken({ signal }, token)
  )
}
