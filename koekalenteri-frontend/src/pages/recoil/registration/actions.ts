import { useTranslation } from "react-i18next"
import { Registration } from "koekalenteri-shared/model"
import { useSnackbar } from "notistack"

import { putRegistration } from "../../../api/registration"

export function useRegistrationActions() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  return {
    save: async (reg: Registration) => {
      const saved = await putRegistration(reg)
      const emails = [saved.handler.email]
      if (saved.owner.email !== saved.handler.email) {
        emails.push(saved.owner.email)
      }
      enqueueSnackbar(
        t(reg.id ? 'registration.modified' : 'registration.saved',
          {
            count: emails.length,
            to: emails.join("\n"),
          }),
        { variant: 'success', style: { whiteSpace: 'pre-line' } },
      )
      return saved
    },

    cancel: async (reg: Registration) => {
      const mod = structuredClone(reg)
      mod.cancelled = true
      const saved = await putRegistration(mod)
      enqueueSnackbar(t('registration.cancelDialog.done'), { variant: 'info' })
      return saved
    },
  }
}
