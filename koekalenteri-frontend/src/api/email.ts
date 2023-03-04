import type { EmailTemplate } from 'koekalenteri-shared/model'

import http from './http'

const PATH = '/admin/email-templates'

export async function getEmailTemplates(signal?: AbortSignal) {
  return http.get<Array<EmailTemplate>>(PATH, { signal })
}

export async function putEmailTemplate(template: EmailTemplate, signal?: AbortSignal) {
  return http.post<EmailTemplate, EmailTemplate>(PATH, template, { signal })
}
