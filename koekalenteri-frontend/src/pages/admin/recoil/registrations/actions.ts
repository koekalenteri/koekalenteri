import { Registration } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { putRegistration } from '../../../../api/registration'

import { currentEventRegistrationsSelector } from './selectors'

export const useAdminRegistrationActions = () => {
  const [adminRegistrations, setAdminRegistrations] = useRecoilState(currentEventRegistrationsSelector)
  return {
    async save(reg: Registration) {
      const regs = [...adminRegistrations]
      const saved = await putRegistration(reg.ownerHandles ? {...reg, handler: {...reg.owner}} : reg)
      const index = regs.findIndex(r => r.id === saved.id)
      const insert = index === -1
      regs.splice(insert ? regs.length : index, insert ? 0 : 1, saved)
      setAdminRegistrations([...regs])
      return saved
    },
  }
}
