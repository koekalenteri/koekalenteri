import type { JsonDogEvent, JsonEventResultTask, JsonRegistration } from '../../types'
import { getRegistrationPlacement } from '../../lib/registration'
import { dogRound, exercisePostsOf, scoresAtPosts } from '../../lib/resultTasks'
import { rotationDogOf } from '../../lib/rotation'

/**
 * A score as a row may hold it: by its exercise and part, or, stored before KOE-1665, at its post and its
 * place among the slots the dog's group takes there, the parts of its exercises there counted in exercise
 * order (a post stored with `tasks: 2` is one exercise in two parts).
 */
type StoredTask = Omit<JsonEventResultTask, 'exercise' | 'part'> &
  Partial<Pick<JsonEventResultTask, 'exercise' | 'part'>> & { stationId?: string; index?: number }

/** A stop or an elimination as a row may hold it: stored before KOE-1665 by its post alone. */
type StoredPlace = { stationId?: string; exercise?: number }

/** A score or a stop the layout cannot place, for the release log: enough to find the dog on the results page. */
type UnplacedScore = {
  eventId: string
  registrationId: string
  class?: string
  number?: number
  stationId?: string
  index?: number
  /** Set for a stop or an elimination; absent for a score. */
  place?: 'retirement' | 'elimination'
}

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

/** The later of two writes of one exercise and part; the other is dropped. */
const laterOf = (a: StoredTask, b: StoredTask) => (new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a)

/**
 * Rewrites a registration's scores stored by post to their exercise and part, in place (KOE-1665), through
 * the dog's round of the event's stored layout, and a stop or an elimination stored by post alone to the
 * last exercise at that post. Of two scores of one exercise and part (one saved by exercise after the
 * deploy, before this ran, beside the one stored by post) the later stays. A score or a place the layout
 * cannot place is left as stored and named in `unplaced`. Only an event scored at posts is read.
 */
export const storeScoresByExercise = (
  registration: JsonRegistration,
  event: JsonDogEvent | undefined
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

  const addressed = (result.tasks ?? []).map((stored) => {
    const task: StoredTask = stored
    if (task.exercise !== undefined) return stored
    const slot = slots.get(`${task.stationId}#${task.index}`)
    if (!slot) {
      unplaced.push(name({ index: task.index, stationId: task.stationId }))
      return stored
    }
    changed = true
    const { stationId: _post, index: _index, ...rest } = task
    return { ...rest, ...slot }
  })

  const keyOf = (task: StoredTask) => `${task.exercise}#${task.part ?? 0}`
  const latest = new Map<string, StoredTask>()
  for (const task of addressed) {
    if (task.exercise === undefined) continue
    const other = latest.get(keyOf(task))
    latest.set(keyOf(task), other ? laterOf(other, task) : task)
  }
  const tasks = addressed.filter((task: StoredTask) => task.exercise === undefined || latest.get(keyOf(task)) === task)
  if (changed || tasks.length !== addressed.length) {
    result.tasks = tasks
    changed = true
  }

  const exerciseAt = (place: StoredPlace | undefined, key: 'retirement' | 'elimination') => {
    if (!place?.stationId || place.exercise !== undefined) return undefined
    const last = posts.lastIndexOf(place.stationId)
    if (last < 0) unplaced.push(name({ place: key, stationId: place.stationId }))
    return last < 0 ? undefined : last + 1
  }
  const retiredAt = exerciseAt(result.retirement, 'retirement')
  if (result.retirement && retiredAt !== undefined) {
    const { stationId: _post, ...retirement } = result.retirement
    result.retirement = { ...retirement, exercise: retiredAt }
    changed = true
  }
  const eliminatedAt = exerciseAt(result.elimination, 'elimination')
  if (result.elimination && eliminatedAt !== undefined) {
    const { stationId: _post, ...elimination } = result.elimination
    result.elimination = { ...elimination, exercise: eliminatedAt }
    changed = true
  }

  return { changed, unplaced }
}
