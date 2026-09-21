import type {
  CollectionResponse,
  DogEvent,
  EmailTemplate,
  EventClass,
  EventState,
  IncrementalCollectionResponse,
  Registration,
  RegistrationMessage,
} from '../types'
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
  return http.get<CollectionResponse<EmailTemplate>>(
    PATH + (since ? `?since=${since.getTime()}` : ''),
    withToken({ signal }, token)
  )
}

export async function putEmailTemplate(template: EmailTemplate, token?: string, signal?: AbortSignal) {
  return (await http.post<EmailTemplate, EmailTemplate>(PATH, template, withToken({ signal }, token))).data
}

export async function sendTemplatedEmail(message: RegistrationMessage, token?: string, signal?: AbortSignal) {
  return (
    await http.post<
      RegistrationMessage,
      {
        ok: string[]
        failed: string[]
        state: EventState
        classes: EventClass[]
        registrations: Registration[]
        /**
         * The start list flag as the server left it: sending the invitations settles an absent flag to
         * false, so the list does not go public on the legacy default (KOE-1432).
         */
        startListPublished: DogEvent['startListPublished']
      }
    >('/admin/email-send', message, withToken({ signal, timeoutMs: EMAIL_SEND_TIMEOUT_MS }, token))
  ).data
}
