import type { DogEvent } from '../../../types'
import type { EventMetadata } from './types'
import { useEffect } from 'react'
import { useRecoilCallback, useRecoilValue } from 'recoil'
import { getEvent, getEvents } from '../../../api/event'
import { isConfirmedEvent } from '../../../lib/typeGuards'
import { eventMetadataAtom, eventsAtom } from './atoms'
import { eventSelector } from './selectors'

type DogEventSortKey = Pick<DogEvent, 'id' | 'startDate' | 'endDate'>
type DogEventPruneKey = Pick<DogEvent, 'endDate'>
type DogEventRangeKey = Pick<DogEvent, 'startDate' | 'endDate'>

const RANGE_INCREMENTAL_THROTTLE = 5 * 60 * 1000 // 5 min
const SINGLE_FRESHNESS = 5 * 60 * 1000 // 5 min

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

function pruneBeforeStart<T extends DogEventPruneKey>(events: T[], start: Date): T[] {
  const startTime = start.getTime()
  return events.filter((e) => {
    if (!e.endDate) {
      return true
    }
    const endTime = new Date(e.endDate).getTime()
    return endTime >= startTime
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

export function useFetchEvents() {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (start?: Date, end?: Date, eventId?: string) => {
        const metadata = await snapshot.getPromise(eventMetadataAtom)
        const events = await snapshot.getPromise(eventsAtom)
        const now = Date.now()

        if (start) {
          // Always prune events that are fully before the requested start.
          const pruned = pruneBeforeStart(events, start)
          if (pruned.length !== events.length) {
            set(eventsAtom, pruned)
          }

          const lastSyncAt = metadata.lastSyncAt
          const shouldThrottleIncremental = Boolean(lastSyncAt && now - lastSyncAt < RANGE_INCREMENTAL_THROTTLE)
          const requestedStart = start.getTime()
          const requestedEnd = end ? end.getTime() : null
          const sameRequestedRange =
            metadata.lastRangeStart === requestedStart && (metadata.lastRangeEnd ?? null) === requestedEnd

          // Fetch strategy:
          // - cold start (no watermark or no local events): full fetch for requested range
          // - warm start: incremental fetch using since=watermark (throttled)
          const isCold = !lastSyncAt || pruned.length === 0
          if (!isCold && shouldThrottleIncremental && sameRequestedRange) {
            set(eventMetadataAtom, {
              ...metadata,
              lastRangeEnd: requestedEnd,
              lastRangeStart: requestedStart,
              retainedStart: start.getTime(),
            })
          } else {
            const response = isCold ? await getEvents(start, end) : await getEvents(start, end, lastSyncAt)
            const nextEvents = Array.isArray(response)
              ? mergeAndSortByDate(pruned, response)
              : reconcileRange(pruned, response.events, response.unchangedIds, start, end)
            set(eventsAtom, nextEvents)
            set(eventMetadataAtom, {
              ...metadata,
              lastRangeEnd: requestedEnd,
              lastRangeStart: requestedStart,
              lastSyncAt: now,
              retainedStart: start.getTime(),
            })
          }
        }

        if (eventId) {
          if (!isSingleFresh(metadata, eventId)) {
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
              ...metadata,
              singles: { ...metadata.singles, [eventId]: now },
            })
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
