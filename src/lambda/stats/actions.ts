// Stats write orchestration.
//
// Owns the entrypoint for recording registration-driven stat changes.
//
// External modules (registration, event, payment) should use the
// RegistrationStatsPort interface from src/lambda/registration/api.ts,
// which delegates to recordRegistrationChange below.

import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { StatsRepository } from './repository'
import { OFFICIAL_EVENT_TYPES } from '../../lib/types'
import { statsRepository } from './repository'
import { calculateStatDeltas, hashStatValue } from './rules'

// ---------------------------------------------------------------------------
// recordRegistrationChange
// ---------------------------------------------------------------------------

type RecordRegistrationChangeInput = {
  event: JsonConfirmedEvent
  next: JsonRegistration
  previous?: JsonRegistration
}

type RecordRegistrationChangeDependencies = {
  repository: StatsRepository
}

/**
 * Records all stat changes driven by a registration mutation.
 *
 * Steps:
 *   1. Calculate numeric deltas from the registration change.
 *   2. Apply deltas to the organizer-event row.
 *   3. Ensure the event year is discoverable.
 *   4. Update yearly participation stats for official event types.
 */
export const createRecordRegistrationChange =
  ({ repository }: RecordRegistrationChangeDependencies) =>
  async ({ event, next, previous }: RecordRegistrationChangeInput): Promise<void> => {
    const deltas = calculateStatDeltas(next, previous)

    await repository.addOrganizerEventDeltas(event, deltas)

    const year = new Date(event.startDate).getUTCFullYear()
    await repository.recordYear(year)

    if (!OFFICIAL_EVENT_TYPES.includes(event.eventType)) return

    await recordYearlyParticipationStats(repository, next, year)
  }

// ---------------------------------------------------------------------------
// Yearly participation stats helper
// ---------------------------------------------------------------------------

type YearlyStatTypes = 'eventType' | 'dog' | 'breed' | 'handler' | 'owner' | 'dog#handler'

const recordYearlyParticipationStats = async (
  repository: StatsRepository,
  registration: JsonRegistration,
  year: number
): Promise<void> => {
  const hashedHandlerEmail = hashStatValue(registration.handler?.email)
  const hashedOwnerEmail = hashStatValue(registration.owner?.email)
  const hashedRegNo = hashStatValue(registration.dog?.regNo)

  const identifiers: Record<YearlyStatTypes, string> = {
    breed: registration.dog.breedCode ?? 'unknown',
    dog: hashedRegNo,
    'dog#handler': `${hashedRegNo}#${hashedHandlerEmail}`,
    eventType: registration.eventType,
    handler: hashedHandlerEmail,
    owner: hashedOwnerEmail,
  }

  for (const [type, entityId] of Object.entries(identifiers)) {
    if (!entityId) continue

    const { previousCount } = await repository.incrementEntityCount(year, type, entityId)

    if (previousCount === undefined) {
      await repository.incrementYearlyTotal(year, type)
    }

    if (type === 'dog#handler') {
      const newCount = (previousCount ?? 0) + 1
      await repository.updateDogHandlerBucket(year, previousCount, newCount)
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton wired to the concrete repository
// ---------------------------------------------------------------------------

export const recordRegistrationChange = createRecordRegistrationChange({ repository: statsRepository })
