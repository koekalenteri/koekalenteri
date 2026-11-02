import type { JsonDogEvent, JsonRegistration } from '../../types'
import { resultRederivedAudit } from '../../lib/audit'
import { scoresAtPosts } from '../../lib/liveFormat'
import { parseEventResultCode, resolveEventResult, shownEventResult } from '../../lib/results'
import { dogRound } from '../../lib/resultTasks'
import { rotationDogOf } from '../../lib/rotation'
import { mapWithConcurrency } from '../../lib/utils'
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
  // A new version of the result, so a dog sent to Omakoira with the second prize reads as changed
  // (`kcResultBadge` compares the version sent with this) and is sent again.
  stored.updatedAt = new Date().toISOString()
  return true
}

/** Audit lines written at once: each goes to its own registration's trail. */
const AUDIT_CONCURRENCY = 5

type WrittenRow = { before: JsonRegistration; item: JsonRegistration }

/** The audit line of a row whose prize the migration raised, or nothing for a row it did not. */
const restoredPrizeAudit = ({ before, item }: WrittenRow) => {
  const eventClass = item.class ?? undefined
  const previous = shownEventResult(before.eventResult?.result, item.eventType, eventClass)
  const result = shownEventResult(item.eventResult?.result, item.eventType, eventClass)
  if (!previous || !result || previous === result) return []

  return [
    {
      auditKey: registrationAuditKey({ eventId: item.eventId, id: item.id }),
      ...resultRederivedAudit(previous, result),
      user: 'system',
    },
  ]
}

/** Records on each registration whose prize the migration raised what it was and what it is now. */
export const auditRestoredFirstPrizes = async (written: readonly WrittenRow[]) => {
  await mapWithConcurrency(written.flatMap(restoredPrizeAudit), AUDIT_CONCURRENCY, (record) => audit(record))
}
