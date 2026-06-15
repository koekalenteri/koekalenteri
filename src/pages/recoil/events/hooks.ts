import type { DogEvent } from '../../../types'
import type { EventMetadata } from './types'
import { useEffect } from 'react'
import { useRecoilCallback, useRecoilValue } from 'recoil'
import { getEvent, getEvents } from '../../../api/event'
import { isConfirmedEvent } from '../../../lib/typeGuards'
import { EVENT_METADATA_INVALIDATED_STORAGE_KEY, eventMetadataAtom, eventsAtom, eventsLoadingAtom } from './atoms'
import { eventSelector } from './selectors'

type DogEventSortKey = Pick<DogEvent, 'id' | 'startDate' | 'endDate'>
type DogEventPruneKey = Pick<DogEvent, 'endDate'>
type DogEventRangeKey = Pick<DogEvent, 'startDate' | 'endDate'>

export const RANGE_INCREMENTAL_THROTTLE = 5 * 60 * 1000 // 5 min
const SINGLE_FRESHNESS = 5 * 60 * 1000 // 5 min
const RANGE_RETENTION_MS = 180 * 24 * 60 * 60 * 1000 // 180 days
const DEFAULT_EVENT_METADATA: EventMetadata = { singles: {} }

type RangeRequest = {
  end: number | null
  start: number
}

type RangePreparation<T> = {
  nextEvents: T[]
  wasPruned: boolean
}

type RangeStrategy =
  | { kind: 'fetch'; isCold: boolean; request: RangeRequest }
  | { kind: 'throttled'; request: RangeRequest }

function compareEventsByDate(a: DogEventSortKey, b: DogEventSortKey) {
  const aStart = a.startDate ? new Date(a.startDate).getTime() : 0
  const bStart = b.startDate ? new Date(b.startDate).getTime() : 0
  if (aStart !== bStart) return aStart - bStart

  const aEnd = a.endDate ? new Date(a.endDate).getTime() : 0
  const bEnd = b.endDate ? new Date(b.endDate).getTime() : 0
  if (aEnd !== bEnd) return aEnd - bEnd

  return a.id.localeCompare(b.id)
}

function mergeAndSortByDate<T extends DogEventSortKey>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const e of incoming) {
    byId.set(e.id, e)
  }
  return [...byId.values()].sort(compareEventsByDate)
}

function pruneBeforeDate<T extends DogEventPruneKey>(events: T[], cutoff: Date): T[] {
  const cutoffTime = cutoff.getTime()
  return events.filter((e) => {
    if (!e.endDate) {
      return true
    }
    const endTime = new Date(e.endDate).getTime()
    return endTime >= cutoffTime
  })
}

function overlapsRange<T extends DogEventRangeKey>(event: T, start: Date, end?: Date): boolean {
  const eventStart = new Date(event.startDate).getTime()
  const eventEnd = new Date(event.endDate ?? event.startDate).getTime()
  const startTime = start.getTime()
  const endTime = end?.getTime() ?? Number.POSITIVE_INFINITY

  return eventEnd >= startTime && eventStart <= endTime
}

function reconcileRange<T extends DogEventSortKey & DogEventRangeKey>(
  existing: T[],
  changed: T[],
  unchangedIds: string[],
  start: Date,
  end?: Date
): T[] {
  const unchangedIdSet = new Set(unchangedIds)
  const retainedOutsideRange = existing.filter((event) => !overlapsRange(event, start, end))
  const retainedUnchangedInRange = existing.filter(
    (event) => overlapsRange(event, start, end) && unchangedIdSet.has(event.id)
  )
  return mergeAndSortByDate(retainedOutsideRange, [...retainedUnchangedInRange, ...changed])
}

function isSingleFresh(metadata: EventMetadata, id: string): boolean {
  const lastFetched = metadata.singles[id]
  return Boolean(lastFetched && Date.now() - lastFetched < SINGLE_FRESHNESS)
}

function getRangeRequest(start: Date, end?: Date): RangeRequest {
  return {
    end: end ? end.getTime() : null,
    start: start.getTime(),
  }
}

function prepareRangeEvents<T extends DogEventPruneKey>(
  events: T[],
  start: Date | undefined,
  now: number
): RangePreparation<T> {
  const retentionCutoff = new Date(now - RANGE_RETENTION_MS)
  const shouldPrune = !start || start.getTime() >= retentionCutoff.getTime()
  const nextEvents = shouldPrune ? pruneBeforeDate(events, retentionCutoff) : events

  return {
    nextEvents,
    wasPruned: nextEvents.length !== events.length,
  }
}

function getRangeStrategy(
  metadata: EventMetadata,
  eventCount: number,
  start: Date,
  end: Date | undefined,
  now: number
): RangeStrategy {
  const request = getRangeRequest(start, end)
  const lastSyncAt = metadata.lastSyncAt
  const shouldThrottleIncremental = Boolean(lastSyncAt && now - lastSyncAt < RANGE_INCREMENTAL_THROTTLE)
  const sameRequestedRange =
    metadata.lastRangeStart === request.start && (metadata.lastRangeEnd ?? null) === request.end
  const isCold = !lastSyncAt || eventCount === 0

  if (!isCold && shouldThrottleIncremental && sameRequestedRange) {
    return { kind: 'throttled', request }
  }

  return { isCold, kind: 'fetch', request }
}

function buildRangeMetadata(
  metadata: EventMetadata,
  request: RangeRequest,
  now: number,
  includeSyncAt: boolean
): EventMetadata {
  return {
    ...metadata,
    lastRangeEnd: request.end,
    lastRangeStart: request.start,
    lastSyncAt: includeSyncAt ? now : metadata.lastSyncAt,
    retainedStart: request.start,
  }
}

function consumeMetadataInvalidation(metadata: EventMetadata): EventMetadata {
  if (localStorage.getItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY) !== 'true') {
    return metadata
  }

  localStorage.removeItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY)
  return DEFAULT_EVENT_METADATA
}

export function useFetchEvents() {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (start?: Date, end?: Date, eventId?: string) => {
        // Set loading eagerly — before any awaits — so React observes the true
        // state in the first render after the microtask yield.
        if (start) {
          set(eventsLoadingAtom, true)
        }

        try {
          const metadata = await snapshot.getPromise(eventMetadataAtom)
          const events = await snapshot.getPromise(eventsAtom)
          const effectiveMetadata = consumeMetadataInvalidation(metadata)
          const now = Date.now()
          const preparedRange = prepareRangeEvents(events, start, now)
          const preparedEvents = preparedRange.nextEvents

          if (effectiveMetadata !== metadata) {
            set(eventMetadataAtom, effectiveMetadata)
          }

          if (preparedRange.wasPruned) {
            set(eventsAtom, preparedEvents)
          }

          if (start) {
            const strategy = getRangeStrategy(effectiveMetadata, preparedEvents.length, start, end, now)

            if (strategy.kind === 'throttled') {
              set(eventMetadataAtom, buildRangeMetadata(effectiveMetadata, strategy.request, now, false))
            } else {
              const response = await getEvents(start, end, strategy.isCold ? undefined : effectiveMetadata.lastSyncAt)
              const nextEvents = reconcileRange(preparedEvents, response.events, response.unchangedIds, start, end)
              set(eventsAtom, nextEvents)
              set(eventMetadataAtom, buildRangeMetadata(effectiveMetadata, strategy.request, now, true))
            }
          }

          if (eventId) {
            if (!isSingleFresh(effectiveMetadata, eventId)) {
              try {
                const event = await getEvent(eventId)
                const merged = mergeAndSortByDate(await snapshot.getPromise(eventsAtom), [event])
                set(eventsAtom, merged)
              } catch {
                // A missing event is represented by leaving it absent from the cache.
                // Consumers can then distinguish "still loading" from "not found"
                // using the single-fetch freshness marker below.
              }

              set(eventMetadataAtom, {
                ...effectiveMetadata,
                singles: { ...effectiveMetadata.singles, [eventId]: now },
              })
            }
          }
        } finally {
          if (start) {
            set(eventsLoadingAtom, false)
          }
        }
      },
    []
  )
}

function useEvent(eventId: string | undefined) {
  const event = useRecoilValue(eventSelector(eventId))
  const metadata = useRecoilValue(eventMetadataAtom)
  const fetchEvents = useFetchEvents()
  const singleFresh = eventId ? isSingleFresh(metadata, eventId) : false

  useEffect(() => {
    // Only fetch if we don't already have a value (including a known `null` for 404).
    if (eventId && event === undefined && !singleFresh) {
      fetchEvents(undefined, undefined, eventId)
    }
  }, [eventId, event, singleFresh, fetchEvents])

  if (eventId && event === undefined && singleFresh) {
    return null
  }

  return event
}

export function useConfirmedEvent(eventId: string | undefined) {
  const event = useEvent(eventId)

  if (event === null) {
    return null
  }

  return event && isConfirmedEvent(event) ? event : undefined
}
