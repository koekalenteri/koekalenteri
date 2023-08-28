import type { Registration, RegistrationGroupInfo } from 'koekalenteri-shared/model'

import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putRegistration, putRegistrationGroups } from '../../../../api/registration'
import { idTokenAtom } from '../../../recoil'
import { adminEventSelector } from '../events'

import { currentEventRegistrationsSelector } from './selectors'

export const useAdminRegistrationActions = (eventId: string) => {
  const [adminRegistrations, setAdminRegistrations] = useRecoilState(currentEventRegistrationsSelector)
  const [event, setEvent] = useRecoilState(adminEventSelector(eventId))
  const token = useRecoilValue(idTokenAtom)
  const { enqueueSnackbar } = useSnackbar()

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
      try {
        const { items, classes, entries, invitedOk, invitedFailed, pickedOk, pickedFailed, reserveOk, reserveFailed } =
          await putRegistrationGroups(eventId, groups, token)

        if (pickedOk.length) {
          enqueueSnackbar('Koepaikkailmoitus lähetetty onnistuneesti\n\n' + pickedOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line' },
          })
        }
        if (invitedOk.length) {
          enqueueSnackbar('Koekutsu lähetetty onnistuneesti\n\n' + invitedOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line' },
          })
        }
        if (reserveOk.length) {
          enqueueSnackbar('Varasijailmoitus lähetetty onnistuneesti\n\n' + reserveOk.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line' },
          })
        }
        if (pickedFailed.length) {
          enqueueSnackbar('Koepaikkailmoituksen lähetys epäonnistui 💩\n\n' + pickedFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line' },
          })
        }
        if (invitedFailed.length) {
          enqueueSnackbar('Koekutsun lähetys epäonnistui 💩\n\n' + invitedFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line' },
          })
        }
        if (pickedFailed.length) {
          enqueueSnackbar('Varasijailmoituksen lähetys epäonnistui 💩\n\n' + reserveFailed.join('\n'), {
            variant: 'success',
            style: { whiteSpace: 'pre-line' },
          })
        }
        setAdminRegistrations(items)
        if (event) {
          setEvent({ ...event, classes, entries })
        }
      } catch (e) {
        console.error(e)
        return false
      }
    },
  }
}
