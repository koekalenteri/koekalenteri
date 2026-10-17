import type {
  CollectionResponse,
  DogEvent,
  EmailTemplate,
  EventClass,
  EventState,
  IncrementalCollectionResponse,
  JsonEmailTemplate,
  JsonEventClass,
  JsonRegistration,
  Registration,
  RegistrationMessage,
} from '../types'
import { arrayOf, converter, toCollection, toEmailTemplate, toEventClass, toRegistration } from '../lib/wire'
import http, { withToken } from './http'

const PATH = '/admin/email-templates'
const EMAIL_SEND_TIMEOUT_MS = 30_000

export function getEmailTemplates(token?: string, signal?: AbortSignal): Promise<EmailTemplate[]>
export function getEmailTemplates(
  token: string | undefined,
  signal: AbortSignal | undefined,
  since: Date
): Promise<IncrementalCollectionResponse<EmailTemplate>>
export async function getEmailTemplates(
  token?: string,
  signal?: AbortSignal,
  since?: Date
): Promise<CollectionResponse<EmailTemplate>> {
  return toCollection(
    await http.get<CollectionResponse<JsonEmailTemplate>>(
      PATH + (since ? `?since=${since.getTime()}` : ''),
      withToken({ signal }, token)
    ),
    toEmailTemplate
  )
}

export async function putEmailTemplate(template: EmailTemplate, token?: string, signal?: AbortSignal) {
  return toEmailTemplate(
    (await http.post<EmailTemplate, JsonEmailTemplate>(PATH, template, withToken({ signal }, token))).data
  )
}

interface JsonEmailSendResponse {
  ok: string[]
  failed: string[]
  state: EventState
  classes: JsonEventClass[]
  registrations: JsonRegistration[]
  /**
   * The start list flag as the server left it: sending the invitations settles an absent flag to
   * false, so the list does not go public on the legacy default (KOE-1432).
   */
  startListPublished: DogEvent['startListPublished']
}

interface EmailSendResponse extends Omit<JsonEmailSendResponse, 'classes' | 'registrations'> {
  classes: EventClass[]
  registrations: Registration[]
}

const toEmailSendResponse = converter<JsonEmailSendResponse, EmailSendResponse>({
  classes: arrayOf(toEventClass),
  registrations: arrayOf(toRegistration),
})

export async function sendTemplatedEmail(
  message: RegistrationMessage,
  token?: string,
  signal?: AbortSignal
): Promise<EmailSendResponse> {
  return toEmailSendResponse(
    (
      await http.post<RegistrationMessage, JsonEmailSendResponse>(
        '/admin/email-send',
        message,
        withToken({ signal, timeoutMs: EMAIL_SEND_TIMEOUT_MS }, token)
      )
    ).data
  )
}
