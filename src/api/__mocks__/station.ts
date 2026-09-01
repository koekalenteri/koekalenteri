import type { EventResult, StationEntry } from '../../types'
import type { EventResultSubmission, EventResultsResponse } from '../registration'
import { vi } from 'vitest'

export const getStationEntry = vi.fn(
  async (_eventId: string, _stationId: string, _token: string, _signal?: AbortSignal): Promise<StationEntry> => {
    throw new Error('not mocked')
  }
)

/** Same shape as the registration mock's putEventResults: every submission reads as written. */
export const putStationEntry = vi.fn(
  async (
    _eventId: string,
    _stationId: string,
    results: EventResultSubmission[],
    _token: string,
    _signal?: AbortSignal
  ): Promise<EventResultsResponse> => ({
    conflicts: [],
    saved: results.map(({ id }) => ({ eventResult: {} as EventResult, id })),
    unchanged: [],
  })
)

export const getStationLink = vi.fn(
  async (_eventId: string, stationId: string, _token: string, _signal?: AbortSignal) => ({
    token: `token-${stationId}`,
  })
)
