import type { AtomEffect } from 'recoil'
import type { EmailTemplate, EmailTemplateId } from '../../../../types'

import i18next from 'i18next'

import { getEmailTemplates } from '../../../../api/email'
import { idTokenAtom } from '../../../recoil'

const templateIds: EmailTemplateId[] = [
  'registration',
  'receipt',
  'picked',
  'reserve',
  'invitation',
  'access',
  'refund',
]

export const adminRemoteEmailTemplatesEffect: AtomEffect<EmailTemplate[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    getPromise(idTokenAtom).then((token) => {
      getEmailTemplates(token)
        .then((emailTemplates) => {
          if (emailTemplates.length < templateIds.length) {
            for (const id of templateIds) {
              if (!emailTemplates.find((t) => t.id === id)) {
                emailTemplates.push({
                  createdAt: new Date(),
                  createdBy: '',
                  en: '',
                  fi: '',
                  id: id as EmailTemplateId,
                  modifiedAt: new Date(),
                  modifiedBy: '',
                })
              }
            }
          }
          const sortedEmailTemplates = [...emailTemplates].sort((a, b) => a.id.localeCompare(b.id, i18next.language))
          setSelf(sortedEmailTemplates)
        })
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
