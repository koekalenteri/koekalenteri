import type { JsonDogEvent, JsonRegistration } from '../../types'
import { resultRederivedAudit } from '../../lib/audit'
import { scoresAtPosts } from '../../lib/liveFormat'
import { parseEventResultCode, resolveEventResult, shownEventResult } from '../../lib/results'
import { dogRound } from '../../lib/resultTasks'
import { rotationDogOf } from '../../lib/rotation'
import { audit, registrationAuditKey } from '../lib/audit'

/**
 * Gives a working test result the first prize the per-task floor withheld (KOE-1677), in place. Until
 * 2.11.2026 a round at 80 % or more with a task under half its points was stored as a second prize; the
 * rules in force place on the percentage alone. The prize is worked out again from the stored scores as
 * a save works it out (`resolveEventResult`), so a stop, an elimination and a zero decide as they would.
 *
 * Only that change is made: a stored second prize the scores now give a first. Any other difference
 * between the stored result and the scores was not the floor's doing and stays as the secretary left it.
 */
export const restoreFirstPrize = (registration: JsonRegistration, event: JsonDogEvent | undefined): boolean => {
  const stored = registration.eventResult
  if (!stored?.tasks?.length || !event || !scoresAtPosts(event.eventType)) return false

  const { eventType } = event
  const eventClass = registration.class ?? undefined
  if (parseEventResultCode(stored.result, eventType, eventClass) !== '2') return false

  const { elimination, retirement, tasks } = stored
  const resolved = resolveEventResult(
    { elimination, retirement, tasks },
    { eventClass, eventType, round: dogRound(event, rotationDogOf(registration)) }
  )
  if (parseEventResultCode(resolved.result, eventType, eventClass) !== '1') return false

  stored.result = resolved.result
  stored.points = resolved.points
  stored.maxPoints = resolved.maxPoints
  stored.percentage = resolved.percentage
  return true
}

/** Records on each registration whose prize the migration raised what it was and what it is now. */
export const auditRestoredFirstPrizes = async (
  written: readonly { before: JsonRegistration; item: JsonRegistration }[]
) => {
  for (const { before, item } of written) {
    const previous = before.eventResult?.result
    const result = item.eventResult?.result
    if (!previous || !result || previous === result) continue

    const eventClass = item.class ?? undefined
    await audit({
      auditKey: registrationAuditKey({ eventId: item.eventId, id: item.id }),
      ...resultRederivedAudit(
        shownEventResult(previous, item.eventType, eventClass) ?? previous,
        shownEventResult(result, item.eventType, eventClass) ?? result
      ),
      user: 'system',
    })
  }
}
