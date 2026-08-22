import type { EmailTemplate } from '../../../../types'
import { useAtom, useAtomValue } from 'jotai'
import { useSnackbar } from 'notistack'
import { putEmailTemplate } from '../../../../api/email'
import { errorSnackbarOptions } from '../../../../lib/client/snackbar'
import { validIdTokenAtom } from '../../../state'
import { adminEmailTemplatesAtom } from './atoms'

export const useAdminEmailTemplatesActions = () => {
  const token = useAtomValue(validIdTokenAtom)
  const { enqueueSnackbar } = useSnackbar()
  const [emailTemplates, setEmailTemplates] = useAtom(adminEmailTemplatesAtom)

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
        enqueueSnackbar(`Virhe: ${e.result ?? ''}`, errorSnackbarOptions)
      }
      return false
    },
  }
}
