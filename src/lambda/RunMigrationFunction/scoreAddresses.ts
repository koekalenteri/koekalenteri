import type { JsonDogEvent, JsonEventResultTask, JsonRegistration } from '../../types'
import { scoresAtPosts } from '../../lib/liveFormat'
import { getRegistrationPlacement } from '../../lib/registration'
import { dogRound, exercisePostsOf, writtenLater } from '../../lib/resultTasks'
import { rotationDogOf } from '../../lib/rotation'

/**
 * The version of the rule below. The migration's `run` names it as a literal, so a correction here that
 * bumps it changes the migration's hash and runs it again at the next deploy.
 */
const SCORE_ADDRESS_RULE = 1

/**
 * A score as a row may hold it: by its exercise and part, or, stored before KOE-1665, at its post and its
 * place among the slots the dog's group takes there, the parts of its exercises there counted in exercise
 * order (a post stored with `tasks: 2` is one exercise in two parts).
 */
type StoredTask = Omit<JsonEventResultTask, 'exercise' | 'part'> &
  Partial<Pick<JsonEventResultTask, 'exercise' | 'part'>> & { stationId?: string; index?: number }

/** A stop or an elimination as a row may hold it: stored before KOE-1665 by its post alone. */
type StoredPlace = { stationId?: string; exercise?: number }

/** The exercise and part of each slot of a round, by the old address: the post and the place there. */
const slotsByPost = (round: ReturnType<typeof dogRound>) => {
  const counted = new Map<string, number>()
  const slots = new Map<string, { exercise: number; part: number }>()
  for (const slot of round) {
    const place = counted.get(slot.stationId) ?? 0
    counted.set(slot.stationId, place + 1)
    slots.set(`${slot.stationId}#${place}`, { exercise: slot.exercise, part: slot.part })
  }
  return slots
}

/** The values a score had, for the log of the ones that cannot be placed. */
const valuesOf = ({ stationId, index, points, zeroFault, recalled, judge, updatedAt }: StoredTask) => ({
  index,
  points,
  stationId,
  updatedAt,
  ...(zeroFault ? { zeroFault } : {}),
  ...(recalled ? { recalled } : {}),
  ...(judge ? { judge: judge.name } : {}),
})

/**
 * A score or a stop the layout cannot place, removed from the row and logged with its values so it can be
 * entered again by hand: the dog as the results page finds it, the post and the slot it was stored at.
 */
type UnplacedScore = Partial<ReturnType<typeof valuesOf>> & {
  eventId: string
  registrationId: string
  class?: string
  number?: number
  /** Set for a stop or an elimination, which keeps its cause with no place; absent for a score. */
  place?: 'retirement' | 'elimination'
}

/** Of the scores of one exercise and part, the one written last. */
const latestOf = (tasks: readonly StoredTask[]) => {
  const latest = new Map<string, StoredTask>()
  for (const task of tasks) {
    const key = `${task.exercise}#${task.part ?? 0}`
    const other = latest.get(key)
    if (!other || writtenLater(task, other)) latest.set(key, task)
  }
  return new Set(latest.values())
}

/**
 * Rewrites a registration's scores stored by post to their exercise and part, in place (KOE-1665), through
 * the dog's round of the event's stored layout, and a stop or an elimination stored by post alone to the
 * last exercise at that post. Of two scores of one exercise and part (one saved by exercise after the
 * deploy, before this ran, beside the one stored by post) the later stays. A score the layout cannot place
 * is removed and named in `unplaced` with its values; a stop or an elimination at a post the round does not
 * have keeps its cause with no place, and is named the same way. Only an event scored at posts is read.
 * `_rule` is `SCORE_ADDRESS_RULE`, which the migration names as a literal.
 */
export const storeScoresByExercise = (
  registration: JsonRegistration,
  event: JsonDogEvent | undefined,
  _rule: typeof SCORE_ADDRESS_RULE
): { changed: boolean; unplaced: UnplacedScore[] } => {
  const result = registration.eventResult
  if (!result || !event || !scoresAtPosts(event.eventType)) return { changed: false, unplaced: [] }

  const round = dogRound(event, rotationDogOf(registration))
  const slots = slotsByPost(round)
  const posts = exercisePostsOf(round)
  const placement = getRegistrationPlacement(registration)
  const unplaced: UnplacedScore[] = []
  const name = (fields: Partial<UnplacedScore>): UnplacedScore => ({
    eventId: registration.eventId,
    registrationId: registration.id,
    ...(registration.class ? { class: registration.class } : {}),
    ...(placement?.number === undefined ? {} : { number: placement.number }),
    ...fields,
  })
  let changed = false

  const addressed = (result.tasks ?? []).flatMap((stored) => {
    const task: StoredTask = stored
    if (task.exercise !== undefined) return [stored]
    changed = true
    const slot = slots.get(`${task.stationId}#${task.index}`)
    if (!slot) {
      unplaced.push(name(valuesOf(task)))
      return []
    }
    const { stationId: _post, index: _index, ...rest } = task
    return [{ ...rest, ...slot }]
  })
  const latest = latestOf(addressed)
  const tasks = addressed.filter((task) => latest.has(task))
  if (changed || tasks.length !== addressed.length) {
    result.tasks = tasks
    changed = true
  }

  /** A stop or an elimination stored by post alone, at the last exercise at its post or at no place. */
  const byExercise = <P extends StoredPlace>(place: P, key: 'retirement' | 'elimination') => {
    if (!place.stationId || place.exercise !== undefined) return place
    changed = true
    const { stationId, ...rest } = place
    const last = posts.lastIndexOf(stationId)
    if (last < 0) unplaced.push(name({ place: key, stationId }))
    return last < 0 ? rest : { ...rest, exercise: last + 1 }
  }
  if (result.retirement) result.retirement = byExercise(result.retirement, 'retirement')
  if (result.elimination) result.elimination = byExercise(result.elimination, 'elimination')

  return { changed, unplaced }
}
