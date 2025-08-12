import type {
  EventClassState,
  EventState,
  Registration,
  RegistrationDate,
  RegistrationGroup,
  RegistrationGroupInfo,
} from '../../../../types'
import type { DragItem } from './types'

import { useTranslation } from 'react-i18next'
import { useSnackbar } from 'notistack'

import { rum } from '../../../../lib/client/rum'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { getRegistrationGroupKey, GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'

import { determineChangesFromDrop } from './dnd'

interface UseDnDHandlersArgs {
  registrations: Registration[]
  state?: EventClassState | EventState
  canArrangeReserve: boolean
  confirm: (opts: {
    title: string
    description: string
    confirmationText: string
    cancellationText: string
  }) => Promise<{ confirmed: boolean }>
  setSelectedRegistrationId?: (id: string | undefined) => void
  saveGroups: (eventId: string, groups: RegistrationGroupInfo[]) => Promise<false | undefined>
  onCancelOpen: (id: string) => void
}

export const useDnDHandlers = ({
  registrations,
  state,
  canArrangeReserve,
  confirm,
  setSelectedRegistrationId,
  saveGroups,
  onCancelOpen,
}: UseDnDHandlersArgs) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()

  const handleDrop = (group: RegistrationGroup) => async (item: DragItem) => {
    const reg = registrations.find((r) => r.id === item.id)
    if (!reg) return

    const isToParticipants = group.key !== GROUP_KEY_CANCELLED && group.key !== GROUP_KEY_RESERVE
    const isChangingGroup = (item.targetGroupKey && item.targetGroupKey !== group.key) || item.groupKey !== group.key
    const requiresConfirm = (state === 'picked' || state === 'invited') && isToParticipants && isChangingGroup

    if (requiresConfirm) {
      const extra = state === 'invited' ? ' sekä koekutsu' : ''
      const { confirmed } = await confirm({
        title: `Olet lisäämässä koiraa ${reg.dog.name} osallistujiin`,
        description: `Kun koirakko on lisätty, koirakolle lähtee vahvistusviesti koepaikasta${extra}. Oletko varma että haluat lisätä koiran ${reg.dog.name} osallistujiin?`,
        confirmationText: 'Lisää osallistujiin',
        cancellationText: t('cancel'),
      })
      if (!confirmed) return
    }

    setSelectedRegistrationId?.(reg.id)

    const regs = registrations.filter((r) => r.group?.key === group.key && r.id !== reg.id)
    const save = determineChangesFromDrop(item, group, reg, regs, canArrangeReserve)

    if (save.length) {
      if (save.length === 1 && (save[0] as any).cancelled) onCancelOpen(save[0].id)
      else await saveGroups(reg.eventId, save)
    }
  }

  const handleReject = (group: RegistrationGroup) => (item: DragItem) => {
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

    if (state === 'picked' && group.key === GROUP_KEY_RESERVE) {
      enqueueSnackbar({
        message: `Kun koepaikat on vahvistettu, ei koirakkoa voi enää siirtää osallistujista varasijalle.`,
        variant: 'warning',
      })
      return
    }

    rum()?.recordEvent('dnd-group-rejected', {
      eventId: reg.eventId,
      registrationId: reg.id,
      targetGroup: group.key,
      sourceGroup: reg.group?.key,
      regGroups: reg.dates.map((rd: RegistrationDate) => eventRegistrationDateKey(rd)).join(', '),
      dropGroups: item.groups.join(', '),
    })
    enqueueSnackbar({ message: `Koira ${reg.dog.name} ei ole ilmoittautunut tähän ryhmään`, variant: 'error' })
  }

  return { handleDrop, handleReject }
}
