import type {
  EventClassState,
  EventState,
  Registration,
  RegistrationDate,
  RegistrationGroup,
  RegistrationGroupMove,
} from '../../../../types'
import type { ConfirmMove } from './moveConfirmation'
import type { DragItem } from './types'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { rum } from '../../../../lib/client/rum'
import { errorSnackbarOptions } from '../../../../lib/client/snackbar'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { GROUP_KEY_RESERVE, getRegistrationGroupKey } from '../../../../lib/registration'
import { determineChangesFromDrop } from './dnd'
import { confirmMoveToParticipants } from './moveConfirmation'

interface UseDnDHandlersArgs {
  disabled?: boolean
  registrations: Registration[]
  state?: EventClassState | EventState
  canArrangeReserve: boolean
  confirm: ConfirmMove
  setSelectedRegistrationId?: (id: string | undefined) => void
  saveGroups: (eventId: string, groups: RegistrationGroupMove[]) => Promise<false | undefined>
  onCancelOpen: (id: string) => void
}

const findAnchor = (change: Pick<Registration, 'group' | 'id'>, registrations: Registration[]) => {
  const number = change.group?.number
  if (typeof number !== 'number') return undefined

  return registrations.find(
    (candidate) => candidate.id !== change.id && (candidate.group?.number ?? Infinity) >= Math.ceil(number)
  )
}

export const useDnDHandlers = ({
  registrations,
  state,
  disabled,
  canArrangeReserve,
  confirm,
  setSelectedRegistrationId,
  saveGroups,
  onCancelOpen,
}: UseDnDHandlersArgs) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  const handleDrop = (group: RegistrationGroup) => async (item: DragItem) => {
    if (disabled) return

    const reg = registrations.find((r) => r.id === item.id)
    if (!reg) return

    const mayMove = await confirmMoveToParticipants({
      confirm,
      dogName: reg.dog.name,
      fromGroupKey: item.groupKey,
      state,
      t,
      toGroupKey: group.key,
    })
    if (!mayMove) return

    setSelectedRegistrationId?.(reg.id)

    const regs = registrations.filter((r) => r.group?.key === group.key && r.id !== reg.id)
    const save = determineChangesFromDrop(item, group, reg, regs, canArrangeReserve)

    if (save.length) {
      if (save.length === 1 && save[0].cancelled) onCancelOpen(save[0].id)
      else
        await saveGroups(
          reg.eventId,
          save.map((change) => {
            const before = findAnchor(change, regs)
            return {
              cancelReason: change.cancelReason,
              group: {
                date: change.group?.date,
                key: change.group?.key ?? GROUP_KEY_RESERVE,
                time: change.group?.time,
              },
              id: change.id,
              ...(before ? { beforeId: before.id } : {}),
            }
          })
        )
    }
  }

  const handleReject = (group: RegistrationGroup) => (item: DragItem) => {
    if (disabled) return

    const reg = registrations.find((r) => r.id === item.id)
    if (!reg) return

    const sameGroup = getRegistrationGroupKey(reg) === group.key
    if (sameGroup) {
      if (group.key === GROUP_KEY_RESERVE) {
        enqueueSnackbar({
          message: `Varasijalla olevia koiria ei voi enää järjestellä, kun varasijailmoituksia on lähetetty`,
          variant: 'info',
        })
      }
      return
    }

    if ((state === 'picked' || state === 'invited') && group.key === GROUP_KEY_RESERVE) {
      enqueueSnackbar({
        message: `Kun koepaikat on vahvistettu, ei koirakkoa voi enää siirtää osallistujista varasijalle.`,
        variant: 'warning',
      })
      return
    }

    rum()?.recordEvent('dnd-group-rejected', {
      dropGroups: item.groups.join(', '),
      eventId: reg.eventId,
      regGroups: reg.dates.map((rd: RegistrationDate) => eventRegistrationDateKey(rd)).join(', '),
      registrationId: reg.id,
      sourceGroup: reg.group?.key,
      targetGroup: group.key,
    })
    enqueueSnackbar({ message: `Koira ${reg.dog.name} ei ole ilmoittautunut tähän ryhmään`, ...errorSnackbarOptions })
  }

  return { handleDrop, handleReject }
}
