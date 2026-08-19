import type { RegistrationClass } from '../../../types'

export type FilterProps = {
  start: Date | null
  end: Date | null
  withOpenEntry?: boolean
  withClosingEntry?: boolean
  withUpcomingEntry?: boolean
  withFreePlaces?: boolean
  eventType: string[]
  eventClass: RegistrationClass[]
  judge: string[]
  organizer: string[]
}

export type EventMetadata = {
  /**
   * Watermark for incremental syncing of public events.
   *
   * When present, subsequent range fetches can ask only events modified after this timestamp
   * (via `/event/?since=...`).
   */
  lastSyncAt?: number // epoch ms

  /**
   * The last successfully fetched range parameters for the list view.
   *
   * Used to decide whether an incremental sync can be skipped (throttled)
   * without risking an empty/incorrect list when the requested range changes.
   */
  lastRangeStart?: number // epoch ms
  lastRangeEnd?: number | null // epoch ms; null means open-ended

  /**
   * The current start boundary of the retained in-memory cache.
   * Events that end before this boundary should be pruned.
   */
  retainedStart?: number // epoch ms (zoned start-of-day)

  /**
   * Per-event fetch freshness for detail views.
   */
  singles: Record<string, number> // event id to lastFetched timestamp
}
