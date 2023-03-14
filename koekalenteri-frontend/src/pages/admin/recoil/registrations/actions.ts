import { Registration, RegistrationGroupInfo } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putRegistration, putRegistrationGroups } from '../../../../api/registration'
import { idTokenSelector } from '../../../recoil'

import { currentEventRegistrationsSelector } from './selectors'

export const useAdminRegistrationActions = () => {
  const [adminRegistrations, setAdminRegistrations] = useRecoilState(currentEventRegistrationsSelector)
  const token = useRecoilValue(idTokenSelector)

  const updateAdminRegistration = (saved: Registration) => {
    const regs = [...adminRegistrations]
    const index = regs.findIndex((r) => r.id === saved.id)
    const insert = index === -1
    regs.splice(insert ? regs.length : index, insert ? 0 : 1, saved)
    setAdminRegistrations([...regs])
  }

  return {
    async save(reg: Registration) {
      const saved = await putRegistration(reg.ownerHandles ? { ...reg, handler: { ...reg.owner } } : reg, token)
      updateAdminRegistration(saved)
      return saved
    },

    async saveGroups(eventId: string, groups: RegistrationGroupInfo[]) {
      const regs = await putRegistrationGroups(eventId, groups, token)
      setAdminRegistrations(regs)
    },
  }
}
