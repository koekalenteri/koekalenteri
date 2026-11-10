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
import { teamDraw, teamDrawMoves, teamDrawPlaces, teamGroupMoves } from '@/lib/teamSelection'
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
 * What a draw comes to (KOE-1722): the teams drawn and placed, by their place in the list, with the dogs
 * that move; the dogs that are mailed their place; the teams drawn that fit no day, or whose class does
 * not take the move; and the moves, all the teams' together, one class at a time.
 */
export interface TeamDrawPlan {
  drawn: { team: number; dogs: string[] }[]
  messaged: string[]
  passed: number[]
  moves: ClassMoves[]
}

/** The moves of several teams as one request per class, in the order the classes first come. */
const byClassOf = (classMoves: readonly ClassMoves[]): ClassMoves[] => {
  const merged = new Map<string, ClassMoves>()
  for (const { eventClass, moves } of classMoves) {
    const before = merged.get(eventClass)
    merged.set(eventClass, { eventClass, moves: [...(before?.moves ?? []), ...moves] })
  }
  return [...merged.values()]
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

  /** The rule a class's moves are held to (`groupMoveError`): the first reason a move is refused, if any. */
  const refusalOf = useCallback(
    (classMove: ClassMoves): GroupMoveError | undefined => {
      if (!event) return undefined
      const state = getEventStateForClass(event, classMove.eventClass)
      return classMove.moves
        .map((move) => {
          const registration = byId.get(move.id)
          return registration && groupMoveError(event, state, getRegistrationGroupKey(registration), move.group.key)
        })
        .find(Boolean)
    },
    [byId, event]
  )

  const plan = useCallback(
    (team: EventTeam, to: TeamMoveTarget): TeamMovePlan => {
      if (!event) return { leftBehind: [], moves: [] }
      const classMoves = teamGroupMoves(team, registrations, to, groupsByClass, event)
      const moves: ClassMoves[] = []
      let refused: GroupMoveError | undefined
      for (const classMove of classMoves) {
        const reason = refusalOf(classMove)
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
    [byId, event, groupsByClass, refusalOf, registrations]
  )

  const dogName = useCallback((id: string) => byId.get(id)?.dog.name ?? id, [byId])

  /** The moves that mail the dogs their koepaikkailmoitus (`moveSendsPlaceMessage`). */
  const messagedBy = useCallback(
    (moves: readonly ClassMoves[]) =>
      event
        ? moves.flatMap(({ eventClass, moves: classMoves }) =>
            classMoves.filter((move) =>
              moveSendsPlaceMessage(
                getEventStateForClass(event, eventClass),
                getRegistrationGroupKey(byId.get(move.id) ?? { group: undefined }),
                move.group.key
              )
            )
          )
        : [],
    [byId, event]
  )

  /**
   * Draws the teams for the places left (KOE-1722, `teamDraw`): the first teams first, in an order set by
   * `random`, as many as the classes and the trial hold, each placed on the days its dogs entered
   * (`teamDrawMoves`). A team drawn whose class does not take the move (`groupMoveError`) is passed, as
   * is one that fits no day.
   */
  const drawPlan = useCallback(
    (teams: readonly EventTeam[], random: () => number): TeamDrawPlan => {
      if (!event) return { drawn: [], messaged: [], moves: [], passed: [] }
      const drawn = teamDraw(teams, registrations, teamDrawPlaces(event, registrations), random)
      const { placed, unplaced } = teamDrawMoves(drawn, teams, registrations, groupsByClass, event)
      const accepted = placed.filter(({ moves }) => !moves.some((classMove) => refusalOf(classMove)))
      const refusedTeams = placed.filter((item) => !accepted.includes(item)).map(({ team }) => team)
      const moves = byClassOf(accepted.flatMap((item) => item.moves))
      return {
        drawn: accepted.map(({ moves: teamMoves, team }) => ({
          dogs: teamMoves.flatMap((classMove) => classMove.moves.map((move) => dogName(move.id))),
          team,
        })),
        messaged: messagedBy(moves).map((move) => dogName(move.id)),
        moves,
        passed: [...unplaced, ...refusedTeams],
      }
    },
    [dogName, event, groupsByClass, messagedBy, refusalOf, registrations]
  )

  /**
   * Sends the moves one class at a time, in the order given: the endpoint takes one class per request.
   * A class that fails answers false rather than throwing, so the classes after it still go. Answers the
   * dogs that did not move.
   */
  const send = useCallback(
    async (moves: readonly ClassMoves[]) => {
      if (!event) return []
      const results = await mapWithConcurrency([...moves], 1, ({ moves: classMoves }) =>
        saveGroups(event.id, classMoves)
      )
      return moves.flatMap(({ moves: classMoves }, index) =>
        results[index] === false ? classMoves.map((move) => dogName(move.id)) : []
      )
    },
    [dogName, event, saveGroups]
  )

  /** Moves the teams a draw placed (`drawPlan`), asked about once, as a whole, before. */
  const moveTeams = useCallback(
    async ({ moves }: TeamDrawPlan) => {
      if (!event || pending || !moves.length) return
      setPending(true)
      try {
        const notMoved = await send(moves)
        if (notMoved.length) {
          enqueueSnackbar(`${t('teams.drawPartlyFailed')} ${notMoved.join(', ')}`, { variant: 'error' })
        } else {
          enqueueSnackbar(t('teams.drawn'), { variant: 'success' })
        }
      } finally {
        setPending(false)
      }
    },
    [enqueueSnackbar, event, pending, send, t]
  )

  const moveTeam = useCallback(
    async (number: number, team: EventTeam, to: TeamMoveTarget) => {
      if (!event || pending) return
      const { leftBehind, moves } = plan(team, to)
      if (!moves.length) return

      setPending(true)
      try {
        const messaged = messagedBy(moves)
        if (messaged.length) {
          const { confirmed } = await confirm({
            cancellationText: t('cancel'),
            confirmationText: t('teams.moveConfirm'),
            description: `${t('teams.moveConfirmDescription')} ${messaged.map((move) => dogName(move.id)).join(', ')}`,
            title: t('teams.moveConfirmTitle', { number }),
          })
          if (!confirmed) return
        }

        const notMoved = await send(moves)
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
    [confirm, dogName, enqueueSnackbar, event, messagedBy, pending, plan, send, t]
  )

  return { drawPlan, moveTeam, moveTeams, pending, plan }
}
