import type { AtomEffect } from 'recoil'
import type { EmailTemplate, EmailTemplateId } from '../../../../types'

import i18next from 'i18next'

import { getEmailTemplates } from '../../../../api/email'
import { exhaustiveStringTuple } from '../../../../lib/typeGuards'
import { idTokenAtom } from '../../../recoil'

const templateIds = exhaustiveStringTuple<EmailTemplateId>()(
  'access',
  'cancel-picked',
  'cancel-reserve',
  'invitation',
  'picked',
  'receipt',
  'refund',
  'registration',
  'reserve'
)

export const adminRemoteEmailTemplatesEffect: AtomEffect<EmailTemplate[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(idTokenAtom).then((token) =>
        getEmailTemplates(token).then((emailTemplates) => {
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
          return emailTemplates.sort((a, b) => a.id.localeCompare(b.id, i18next.language))
        })
      )
    )
  }
}
