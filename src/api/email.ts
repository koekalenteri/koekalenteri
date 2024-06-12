import type { EmailTemplate, EventClass, EventState, Registration, RegistrationMessage } from '../types'

import http, { withToken } from './http'

const PATH = '/admin/email-templates'

export async function getEmailTemplates(token?: string, signal?: AbortSignal) {
  return http.get<Array<EmailTemplate>>(PATH, withToken({ signal }, token))
}

export async function putEmailTemplate(template: EmailTemplate, token?: string, signal?: AbortSignal) {
  return http.post<EmailTemplate, EmailTemplate>(PATH, template, withToken({ signal }, token))
}

export async function sendTemplatedEmail(message: RegistrationMessage, token?: string, signal?: AbortSignal) {
  return http.post<
    RegistrationMessage,
    { ok: string[]; failed: string[]; state: EventState; classes: EventClass[]; registrations: Registration[] }
  >('/admin/email-send', message, withToken({ signal }, token))
}
