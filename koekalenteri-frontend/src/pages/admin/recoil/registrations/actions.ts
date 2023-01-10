import { Registration } from "koekalenteri-shared/model"
import { useSnackbar } from "notistack"
import { useRecoilState } from "recoil"

import { putRegistration } from "../../../../api/registration"

import { currentEventRegistrationsSelector } from "./selectors"

export const useAdminRegistrationActions = () => {
  const { enqueueSnackbar } = useSnackbar()
  const [adminRegistrations, setAdminRegistrations] = useRecoilState(currentEventRegistrationsSelector)
  return {
    async save(registration: Registration) {
      try {
        const regs = [...adminRegistrations]
        const saved = await putRegistration(registration)
        const index = regs.findIndex(r => r.id === saved.id)
        const insert = index === -1
        regs.splice(insert ? regs.length : index, insert ? 0 : 1, saved)
        setAdminRegistrations([...regs])
        return true
      } catch(e) {
        console.log(e)
        if (e instanceof TypeError) {
          enqueueSnackbar(`${e.name}: ${e.message}`)
        }
        return false
      }
    },
  }
}
