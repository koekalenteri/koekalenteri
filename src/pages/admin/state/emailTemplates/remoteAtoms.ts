import type { EmailTemplate, EmailTemplateId } from '@/types'
import { getEmailTemplates } from '@/api/email'
import { compareByLocalizedString } from '@/lib/client/sort'
import { exhaustiveStringTuple } from '@/lib/typeGuards'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

const templateIds = exhaustiveStringTuple<EmailTemplateId>()(
  'access',
  'cancel-early',
  'cancel-picked',
  'cancel-reserve',
  'invitation',
  'message',
  'payment-request',
  'picked',
  'receipt',
  'refund',
  'registration',
  'reserve'
)

const placeholderTemplate = (id: EmailTemplateId): EmailTemplate => ({
  createdAt: new Date(),
  createdBy: '',
  en: '',
  fi: '',
  id,
  modifiedAt: new Date(),
  modifiedBy: '',
})

/**
 * The list with an empty placeholder for every template id the code knows but the table does not
 * hold yet, so a new template can be written on the templates page and picked in the message dialog.
 *
 * A template id is added in code, which changes neither the table nor its data version: a browser
 * that cached the list before the id existed keeps a fresh-looking blob without it (KOE-1073, the
 * "message" template). The padding therefore has to run on every list this atom serves - cached,
 * fetched or reconciled - not only on the fetch. A complete list is returned as is.
 */
export const withEveryTemplate = (templates: EmailTemplate[]): EmailTemplate[] => {
  const missing = templateIds.filter((id) => !templates.some((template) => template.id === id))
  return missing.length ? [...templates, ...missing.map(placeholderTemplate)] : templates
}

export async function fetchEmailTemplates(token: string): Promise<EmailTemplate[]> {
  return withEveryTemplate(await getEmailTemplates(token))
}

export const adminEmailTemplatesRemoteAtom = atomWithCachedRemoteCollection<EmailTemplate>({
  cacheKey: 'emailTemplates',
  fetch: fetchEmailTemplates,
  // Runs on the cached list as well as on a fetched one, which is where the padding must happen.
  sort: (items) => withEveryTemplate(items).sort(compareByLocalizedString('id')),
})
