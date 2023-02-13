import i18next from 'i18next'
import { EmailTemplate, EmailTemplateId } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getEmailTemplates } from '../../../../api/email'

const templateIds: EmailTemplateId[] = [
  'registration',
  'reserve',
]


export const remoteEmailTemplatesEffect: AtomEffect<EmailTemplate[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    getEmailTemplates().then(emailTemplates => {
      if (emailTemplates.length < templateIds.length) {
        for (const id of templateIds) {
          if (!emailTemplates.find(t => t.id === id)) {
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
  }
}
