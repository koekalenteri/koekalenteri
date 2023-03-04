import { EmailTemplate } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { putEmailTemplate } from '../../../../api/email'

import { emailTemplatesAtom } from './atoms'

export const useEmailTemplatesActions = () => {
  const [emailTemplates, setEmailTemplates] = useRecoilState(emailTemplatesAtom)
  return {
    async save(template: EmailTemplate) {
      const templates = [...emailTemplates]
      const saved = await putEmailTemplate(template)
      const index = templates.findIndex((i) => i.id === saved.id)
      templates.splice(index, 1, saved)
      setEmailTemplates(templates)
      return saved
    },
  }
}
