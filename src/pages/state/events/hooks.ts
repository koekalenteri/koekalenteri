import type { DogEvent, PublicDogEvent } from '../../../types'
import type { EventMetadata } from './types'
import { useAtomValue } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { useCallback, useEffect } from 'react'
import { getEvent, getEvents } from '../../../api/event'
import { compareEventsByDate } from '../../../lib/event'
import { isConfirmedEvent } from '../../../lib/typeGuards'
import { EVENT_METADATA_INVALIDATED_STORAGE_KEY, eventMetadataAtom, eventsAtom, eventsLoadingAtom } from './atoms'
import { eventAtom } from './derivedAtoms'

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

function hasMissingUnchangedEvents<T extends DogEventSortKey & DogEventRangeKey>(
  existing: T[],
  changed: T[],
  unchangedIds: string[],
  start: Date,
  end?: Date
): boolean {
  if (!unchangedIds.length) return false

  const knownIds = new Set([
    ...existing.filter((event) => overlapsRange(event, start, end)).map((event) => event.id),
    ...changed.map((event) => event.id),
  ])

  return unchangedIds.some((id) => !knownIds.has(id))
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

async function getRangeSyncResult(
  metadata: EventMetadata,
  preparedEvents: PublicDogEvent[],
  start: Date,
  end: Date | undefined,
  now: number
): Promise<{ events?: PublicDogEvent[]; metadata: EventMetadata }> {
  const strategy = getRangeStrategy(metadata, preparedEvents.length, start, end, now)

  if (strategy.kind === 'throttled') {
    return { metadata: buildRangeMetadata(metadata, strategy.request, now, false) }
  }

  const response = await getEvents(start, end, strategy.isCold ? undefined : metadata.lastSyncAt)
  const completeResponse = hasMissingUnchangedEvents(preparedEvents, response.events, response.unchangedIds, start, end)
    ? await getEvents(start, end)
    : response

  return {
    events: reconcileRange(preparedEvents, completeResponse.events, completeResponse.unchangedIds, start, end),
    metadata: buildRangeMetadata(metadata, strategy.request, now, true),
  }
}

async function getSingleSyncResult(
  events: PublicDogEvent[],
  metadata: EventMetadata,
  eventId: string,
  now: number
): Promise<{ events?: PublicDogEvent[]; metadata: EventMetadata }> {
  if (isSingleFresh(metadata, eventId)) {
    return { metadata }
  }

  try {
    const event = await getEvent(eventId)
    return {
      events: mergeAndSortByDate(events, [event]),
      metadata: { ...metadata, singles: { ...metadata.singles, [eventId]: now } },
    }
  } catch {
    // A missing event is represented by leaving it absent from the cache.
    // Consumers can then distinguish "still loading" from "not found".
    return { metadata: { ...metadata, singles: { ...metadata.singles, [eventId]: now } } }
  }
}

export function useFetchEvents() {
  return useAtomCallback(
    useCallback(async (get, set, start?: Date, end?: Date, eventId?: string) => {
      // Set loading eagerly — before any awaits — so React observes the true
      // state in the first render after the microtask yield.
      if (start) {
        set(eventsLoadingAtom, true)
      }

      try {
        const metadata = get(eventMetadataAtom)
        const events = get(eventsAtom)
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

        let nextMetadata = effectiveMetadata
        if (start) {
          const rangeResult = await getRangeSyncResult(effectiveMetadata, preparedEvents, start, end, now)
          if (rangeResult.events) set(eventsAtom, rangeResult.events)
          nextMetadata = rangeResult.metadata
          set(eventMetadataAtom, nextMetadata)
        }

        if (eventId) {
          const currentEvents = get(eventsAtom)
          const singleResult = await getSingleSyncResult(currentEvents, nextMetadata, eventId, now)
          if (singleResult.events) set(eventsAtom, singleResult.events)
          if (singleResult.metadata !== nextMetadata) set(eventMetadataAtom, singleResult.metadata)
        }
      } finally {
        if (start) {
          set(eventsLoadingAtom, false)
        }
      }
    }, [])
  )
}

function useEvent(eventId: string | undefined) {
  const event = useAtomValue(eventAtom(eventId))
  const metadata = useAtomValue(eventMetadataAtom)
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
  const metadata = useAtomValue(eventMetadataAtom)
  const fetchEvents = useFetchEvents()
  const singleFresh = eventId ? isSingleFresh(metadata, eventId) : false
  const usable = !!event && isConfirmedEvent(event)

  useEffect(() => {
    // The cache can hold a pre-confirmation copy from an earlier visit while the server already
    // has a usable one. Left alone it would read as "loading" forever (KOE-1262), so refresh it.
    if (eventId && event && !usable && !singleFresh) {
      fetchEvents(undefined, undefined, eventId)
    }
  }, [eventId, event, usable, singleFresh, fetchEvents])

  if (event === null) {
    return null
  }

  // A fresh copy that still isn't a confirmed event is a definitive miss, not a pending load.
  if (event && !usable && singleFresh) {
    return null
  }

  return usable ? event : undefined
}
