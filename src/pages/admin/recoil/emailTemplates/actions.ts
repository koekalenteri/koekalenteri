import type { EmailTemplate } from '../../../../types'

import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putEmailTemplate } from '../../../../api/email'
import { idTokenAtom } from '../../../recoil'

import { emailTemplatesAtom } from './atoms'

export const useEmailTemplatesActions = () => {
  const token = useRecoilValue(idTokenAtom)
  const { enqueueSnackbar } = useSnackbar()
  const [emailTemplates, setEmailTemplates] = useRecoilState(emailTemplatesAtom)

  return {
    async save(template: EmailTemplate) {
      const templates = [...emailTemplates]
      try {
        if (!token) throw new Error('missing token')
        const saved = await putEmailTemplate(template, token)
        const index = templates.findIndex((i) => i.id === saved.id)
        templates.splice(index, 1, saved)
        setEmailTemplates(templates)
        return true
      } catch (e: any) {
        enqueueSnackbar(`Virhe: ${e.result ?? ''}`, { variant: 'error' })
      }
      return false
    },
  }
}
