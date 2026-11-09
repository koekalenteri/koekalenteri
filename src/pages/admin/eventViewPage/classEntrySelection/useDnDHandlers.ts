import type { DogEvent, Registration, RegistrationDate, RegistrationGroup, RegistrationGroupMove } from '@/types'
import type { ConfirmMove } from './moveConfirmation'
import type { DragItem } from './types'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { recordEvent } from '@/lib/client/rum'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { eventRegistrationDateKey, getEventStateForClass } from '@/lib/event'
import { GROUP_KEY_RESERVE, getRegistrationClass, getRegistrationGroupKey } from '@/lib/registration'
import { groupMoveError } from '@/lib/registrationGroups'
import { determineChangesFromDrop } from './dnd'
import { confirmMoveToParticipants } from './moveConfirmation'

interface UseDnDHandlersArgs {
  disabled?: boolean
  event: DogEvent
  registrations: Registration[]
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
  event,
  registrations,
  disabled,
  canArrangeReserve,
  confirm,
  setSelectedRegistrationId,
  saveGroups,
  onCancelOpen,
}: UseDnDHandlersArgs) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  // The dog's own class decides what it may do, as on the server (KOE-1722), also on the all-classes
  // tab, where the page's state is the event's, which is not every class's.
  const classStateOf = (reg: Registration) => getEventStateForClass(event, getRegistrationClass(reg, event))

  const handleDrop = (group: RegistrationGroup) => async (item: DragItem) => {
    if (disabled) return

    const reg = registrations.find((r) => r.id === item.id)
    if (!reg) return

    const refused = groupMoveError(event, classStateOf(reg), item.groupKey, group.key)
    if (refused) {
      enqueueSnackbar({ message: t('registration.groupMoveRefused', { context: refused }), variant: 'warning' })
      return
    }

    const mayMove = await confirmMoveToParticipants({
      confirm,
      event,
      fromGroupKey: item.groupKey,
      registration: reg,
      state: classStateOf(reg),
      t,
      toGroupKey: group.key,
    })
    if (!mayMove) return

    setSelectedRegistrationId?.(reg.id)

    // The siblings are the rows in this group by the one rule the server moves by: a start is named by
    // its date and time, whatever key it was stored with, and a cancelled entry belongs to the
    // cancelled group. An anchor chosen among them is one the server accepts.
    const regs = registrations.filter((r) => getRegistrationGroupKey(r) === group.key && r.id !== reg.id)
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
          message: t('eventManagement.participantSelection.reserveLocked'),
          variant: 'info',
        })
      }
      return
    }

    // The rule the server holds every move to (`groupMoveError`, KOE-1722).
    if (groupMoveError(event, classStateOf(reg), getRegistrationGroupKey(reg), group.key) === 'reserveAfterPicking') {
      enqueueSnackbar({
        message: t('eventManagement.participantSelection.cannotMoveToReserve'),
        variant: 'warning',
      })
      return
    }

    recordEvent('dnd-group-rejected', {
      dropGroups: item.groups.join(', '),
      eventId: reg.eventId,
      regGroups: reg.dates.map((rd: RegistrationDate) => eventRegistrationDateKey(rd)).join(', '),
      registrationId: reg.id,
      sourceGroup: reg.group?.key,
      targetGroup: group.key,
    })
    enqueueSnackbar({
      message: t('eventManagement.participantSelection.notRegisteredToGroup', { dogName: reg.dog.name }),
      ...errorSnackbarOptions,
    })
  }

  return { handleDrop, handleReject }
}
