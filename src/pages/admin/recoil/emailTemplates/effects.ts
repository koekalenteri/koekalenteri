import type { AtomEffect } from 'recoil'
import type { EmailTemplate, EmailTemplateId } from '../../../../types'
import { getEmailTemplates } from '../../../../api/email'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { exhaustiveStringTuple } from '../../../../lib/typeGuards'
import { createCachedRemoteCollectionEffect } from '../cached/createCachedRemoteCollection'

const templateIds = exhaustiveStringTuple<EmailTemplateId>()(
  'access',
  'cancel-early',
  'cancel-picked',
  'cancel-reserve',
  'invitation',
  'picked',
  'receipt',
  'refund',
  'registration',
  'reserve'
)

export async function fetchEmailTemplates(token: string): Promise<EmailTemplate[]> {
  const emailTemplates = await getEmailTemplates(token)
  if (emailTemplates.length < templateIds.length) {
    for (const id of templateIds) {
      if (!emailTemplates.some((t) => t.id === id)) {
        emailTemplates.push({
          createdAt: new Date(),
          createdBy: '',
          en: '',
          fi: '',
          id,
          modifiedAt: new Date(),
          modifiedBy: '',
        })
      }
    }
  }
  return emailTemplates
}

export const adminRemoteEmailTemplatesEffect: AtomEffect<EmailTemplate[]> = createCachedRemoteCollectionEffect({
  cacheKey: 'emailTemplates',
  fetch: fetchEmailTemplates,
  sort: (items) => {
    items.sort(compareByLocalizedString('id'))
    return items
  },
})
