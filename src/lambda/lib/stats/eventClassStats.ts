import type { EventClassStatsRow } from '../../../types/Stats'
import { buildEventClassStats, isEventInClassStats } from '../../../lib/eventClassStats'
import { mapWithConcurrency } from '../../../lib/utils'
import { readSeasonEvents } from '../repositories/eventRepository'
import { readEventRegistrations } from '../repositories/registrationRepository'

/** Each event's registrations are one partition's query; this many run at a time. */
const EVENT_READ_CONCURRENCY = 10

/**
 * The season's trials class by class (KOE-1595), from the events and their registrations as they
 * are now. Drafts, cancelled and deleted trials are left out before their registrations are read.
 */
export const getEventClassStats = async (season: number): Promise<EventClassStatsRow[]> => {
  const events = (await readSeasonEvents(season)) ?? []
  const included = events.filter(isEventInClassStats)
  const rows = await mapWithConcurrency(included, EVENT_READ_CONCURRENCY, async (event) =>
    buildEventClassStats(event, await readEventRegistrations(event.id))
  )
  return rows.flat()
}
