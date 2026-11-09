import type { DogEvent, EventTeam, Registration } from '@/types'
import { useConfirm } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdminEventClassGroups } from '@/hooks/useAdminEventClassGroups'
import { getEventStateForClass } from '@/lib/event'
import { getRegistrationGroupKey } from '@/lib/registration'
import { teamGroupMoves } from '@/lib/teamSelection'
import { moveSendsPlaceMessage } from '../eventViewPage/classEntrySelection/moveConfirmation'
import { useAdminRegistrationActions } from '../state/registrations/actions'

/** Where a whole team is sent: to the participants, or to the reserve list. */
export type TeamMoveTarget = 'participants' | 'reserve'

/**
 * Moves a whole team (KOE-1722): its members to the participants, each to the group of a day it entered,
 * or to the reserve list. The group endpoint takes the dogs of one class at a time, so the classes go
 * one after another in the event's class order; a class that fails does not stop the others, and the
 * dogs of the classes that did not move are named. A move that mails dogs their koepaikkailmoitus asks
 * first, naming those dogs, by the rule the class view asks by (`moveSendsPlaceMessage`).
 */
export const useMoveTeam = (event: DogEvent | undefined, registrations: readonly Registration[]) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { enqueueSnackbar } = useSnackbar()
  const { saveGroups } = useAdminRegistrationActions(event?.id ?? '')
  const groupsByClass = useAdminEventClassGroups(event)

  return useCallback(
    async (number: number, team: EventTeam, to: TeamMoveTarget) => {
      if (!event) return
      const byId = new Map(registrations.map((registration) => [registration.id, registration]))
      const dogName = (id: string) => byId.get(id)?.dog.name ?? id
      const classMoves = teamGroupMoves(team, registrations, to, groupsByClass, event)
      if (!classMoves.length) return

      const messaged = classMoves.flatMap(({ eventClass, moves }) =>
        moves.filter((move) =>
          moveSendsPlaceMessage(
            getEventStateForClass(event, eventClass),
            getRegistrationGroupKey(byId.get(move.id) ?? { group: undefined }),
            move.group.key
          )
        )
      )
      if (messaged.length) {
        const { confirmed } = await confirm({
          cancellationText: t('cancel'),
          confirmationText: t('teams.moveConfirm'),
          description: `${t('teams.moveConfirmDescription')} ${messaged.map((move) => dogName(move.id)).join(', ')}`,
          title: t('teams.moveConfirmTitle', { number }),
        })
        if (!confirmed) return
      }

      const notMoved: string[] = []
      for (const { moves } of classMoves) {
        if ((await saveGroups(event.id, moves)) === false) notMoved.push(...moves.map((move) => dogName(move.id)))
      }
      if (notMoved.length) {
        enqueueSnackbar(`${t('teams.movePartlyFailed', { number })} ${notMoved.join(', ')}`, { variant: 'error' })
      } else {
        enqueueSnackbar(t('teams.moved', { number }), { variant: 'success' })
      }
    },
    [confirm, enqueueSnackbar, event, groupsByClass, registrations, saveGroups, t]
  )
}
