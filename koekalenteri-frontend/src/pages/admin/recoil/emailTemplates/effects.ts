import i18next from 'i18next'
import { EmailTemplate } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getEmailTemplates } from '../../../../api/email'

export const remoteEmailTemplatesEffect: AtomEffect<EmailTemplate[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    getEmailTemplates().then(emailTemplates => {
      const sortedEmailTemplates = [...emailTemplates].sort((a, b) => a.id.localeCompare(b.id, i18next.language))
      setSelf(sortedEmailTemplates)
    })
  }
}
