import type { GroupMoveError } from '@/lib/registrationGroups'
import type { ClassMoves } from '@/lib/teamSelection'
import type { DogEvent, EventTeam, Registration } from '@/types'
import { useConfirm } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdminEventClassGroups } from '@/hooks/useAdminEventClassGroups'
import { getEventStateForClass } from '@/lib/event'
import { getRegistrationGroupKey, isParticipantGroup } from '@/lib/registration'
import { groupMoveError } from '@/lib/registrationGroups'
import { teamGroupMoves } from '@/lib/teamSelection'
import { mapWithConcurrency } from '@/lib/utils'
import { moveSendsPlaceMessage } from '../eventViewPage/classEntrySelection/moveConfirmation'
import { useAdminRegistrationActions } from '../state/registrations/actions'

/** Where a whole team is sent: to the participants, or to the reserve list. */
export type TeamMoveTarget = 'participants' | 'reserve'

/**
 * What moving a team one way comes to (KOE-1722): the classes whose dogs move, the rule that keeps
 * the other classes' dogs where they are (`groupMoveError`), and the dogs left behind for having no
 * class, or no group in their class, to be moved to.
 */
interface TeamMovePlan {
  moves: ClassMoves[]
  refused?: GroupMoveError
  leftBehind: string[]
}

/**
 * Moves a whole team (KOE-1722): its members to the participants, each to the group of a day it entered,
 * or to the reserve list. The group endpoint takes the dogs of one class at a time, so the classes go
 * one after another in the event's class order; a class that fails does not stop the others, and the
 * dogs not moved are named, as are the dogs with no group to go to. A class whose state does not allow
 * the move (`groupMoveError`, the rule the class view and the endpoint hold to) is not sent. A move
 * that mails dogs their koepaikkailmoitus asks first, naming those dogs (`moveSendsPlaceMessage`).
 * While a move runs, `pending` holds, so a second click cannot send the dogs again.
 */
export const useMoveTeam = (event: DogEvent | undefined, registrations: readonly Registration[]) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { enqueueSnackbar } = useSnackbar()
  const { saveGroups } = useAdminRegistrationActions(event?.id ?? '')
  const groupsByClass = useAdminEventClassGroups(event)
  const [pending, setPending] = useState(false)
  const byId = useMemo(
    () => new Map(registrations.map((registration) => [registration.id, registration])),
    [registrations]
  )

  const plan = useCallback(
    (team: EventTeam, to: TeamMoveTarget): TeamMovePlan => {
      if (!event) return { leftBehind: [], moves: [] }
      const classMoves = teamGroupMoves(team, registrations, to, groupsByClass, event)
      const moves: ClassMoves[] = []
      let refused: GroupMoveError | undefined
      for (const classMove of classMoves) {
        const state = getEventStateForClass(event, classMove.eventClass)
        const reason = classMove.moves
          .map((move) => {
            const registration = byId.get(move.id)
            return registration && groupMoveError(event, state, getRegistrationGroupKey(registration), move.group.key)
          })
          .find(Boolean)
        if (reason) refused ??= reason
        else moves.push(classMove)
      }
      // Only the classes that move: a dog of a class the rule keeps where it is is left behind too.
      const moving = new Set(moves.flatMap((classMove) => classMove.moves.map((move) => move.id)))
      const leftBehind = team.registrationIds.flatMap((id) => {
        const registration = byId.get(id)
        if (!registration || registration.cancelled || moving.has(id)) return []
        const participant = isParticipantGroup(getRegistrationGroupKey(registration))
        return participant === (to === 'reserve') ? [registration.dog.name ?? id] : []
      })
      return { leftBehind, moves, refused }
    },
    [byId, event, groupsByClass, registrations]
  )

  const moveTeam = useCallback(
    async (number: number, team: EventTeam, to: TeamMoveTarget) => {
      if (!event || pending) return
      const { leftBehind, moves } = plan(team, to)
      if (!moves.length) return
      const dogName = (id: string) => byId.get(id)?.dog.name ?? id

      setPending(true)
      try {
        const messaged = moves.flatMap(({ eventClass, moves: classMoves }) =>
          classMoves.filter((move) =>
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

        // One class at a time, in the event's class order: the endpoint takes one class per request. A
        // class that fails answers false rather than throwing, so the classes after it still go.
        const results = await mapWithConcurrency(moves, 1, ({ moves: classMoves }) => saveGroups(event.id, classMoves))
        const notMoved = moves.flatMap(({ moves: classMoves }, index) =>
          results[index] === false ? classMoves.map((move) => dogName(move.id)) : []
        )
        const left = [...notMoved, ...leftBehind]
        if (left.length) {
          enqueueSnackbar(`${t('teams.movePartlyFailed', { number })} ${left.join(', ')}`, { variant: 'error' })
        } else {
          enqueueSnackbar(t('teams.moved', { number }), { variant: 'success' })
        }
      } finally {
        setPending(false)
      }
    },
    [byId, confirm, enqueueSnackbar, event, pending, plan, saveGroups, t]
  )

  return { moveTeam, pending, plan }
}
