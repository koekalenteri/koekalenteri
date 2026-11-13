import type { EmailTemplate, EmailTemplateId, JsonEmailTemplate } from '@/types'
import { getEmailTemplates } from '@/api/email'
import { compareByLocalizedString } from '@/lib/client/sort'
import { EMAIL_TEMPLATE_IDS } from '@/lib/emailTemplateIds'
import { toEmailTemplate } from '@/lib/wire'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

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
 * A legacy template id (one without defaults) was added in code, which changed neither the table
 * nor its data version: a browser that cached the list before the id existed keeps a fresh-looking
 * blob without it (KOE-1073, the "message" template). The padding therefore has to run on every list
 * this atom serves - cached, fetched or reconciled - not only on the fetch. A complete list is
 * returned as is. A template added with defaults (src/lambda/lib/emailTemplateDefaults) gets its row
 * from the deploy, which also bumps the version, so its placeholder is only ever a moment's (KOE-1363).
 */
export const withEveryTemplate = (templates: EmailTemplate[]): EmailTemplate[] => {
  const missing = EMAIL_TEMPLATE_IDS.filter((id) => !templates.some((template) => template.id === id))
  return missing.length ? [...templates, ...missing.map(placeholderTemplate)] : templates
}

export async function fetchEmailTemplates(token: string): Promise<EmailTemplate[]> {
  return withEveryTemplate(await getEmailTemplates(token))
}

export const adminEmailTemplatesRemoteAtom = atomWithCachedRemoteCollection<EmailTemplate, JsonEmailTemplate>({
  cacheKey: 'emailTemplates',
  fetch: fetchEmailTemplates,
  revive: toEmailTemplate,
  // Runs on the cached list as well as on a fetched one, which is where the padding must happen.
  sort: (items) => withEveryTemplate(items).sort(compareByLocalizedString('id')),
})
