import type { JsonStationTurn } from '../types'
import {
  completedGroupTurns,
  isBreakTurn,
  isStoredStationTurn,
  liveStationIds,
  openTurn,
  stationThroughput,
  toPublicStationTurn,
  turnDurationMs,
} from './stationTurns'

const turn = (overrides: Partial<JsonStationTurn>): JsonStationTurn => ({
  dogs: [{ name: 'Dog', number: 1 }],
  id: 'turn-1',
  registrationIds: ['run-1'],
  startedAt: '2026-09-12T08:00:00.000Z',
  stationId: 'post-1',
  ...overrides,
})

const minuteTurn = (id: string, startMinute: number, endMinute?: number, overrides: Partial<JsonStationTurn> = {}) =>
  turn({
    id,
    startedAt: `2026-09-12T08:${String(startMinute).padStart(2, '0')}:00.000Z`,
    ...(endMinute === undefined ? {} : { endedAt: `2026-09-12T08:${String(endMinute).padStart(2, '0')}:00.000Z` }),
    ...overrides,
  })

describe('stationTurns', () => {
  describe('openTurn', () => {
    it('finds the span with no end on the right post only', () => {
      const turns = [minuteTurn('a', 0, 7), minuteTurn('b', 7), minuteTurn('c', 7, undefined, { stationId: 'post-2' })]

      expect(openTurn(turns, 'post-1')?.id).toBe('b')
      expect(openTurn(turns, 'post-2')?.id).toBe('c')
      expect(openTurn([minuteTurn('a', 0, 7)], 'post-1')).toBeUndefined()
    })
  })

  describe('completedGroupTurns', () => {
    it('keeps closed dog-carrying spans and drops breaks and the open span', () => {
      const turns = [
        minuteTurn('a', 0, 7),
        minuteTurn('break', 7, 20, { dogs: [], pause: 'coffee', registrationIds: [] }),
        minuteTurn('open', 20),
      ]

      expect(completedGroupTurns(turns, 'post-1').map((item) => item.id)).toEqual(['a'])
    })
  })

  describe('isBreakTurn', () => {
    it('recognizes a pause code', () => {
      expect(isBreakTurn({ pause: 'lunch' })).toBe(true)
      expect(isBreakTurn({})).toBe(false)
    })
  })

  describe('turnDurationMs', () => {
    it('measures a closed span and reads an open one as zero', () => {
      expect(turnDurationMs(minuteTurn('a', 0, 7))).toBe(7 * 60000)
      expect(turnDurationMs(minuteTurn('a', 0))).toBe(0)
    })

    it('accepts revived Date timestamps', () => {
      expect(
        turnDurationMs({ endedAt: new Date('2026-09-12T08:06:00Z'), startedAt: new Date('2026-09-12T08:00:00Z') })
      ).toBe(6 * 60000)
    })
  })

  describe('stationThroughput', () => {
    it('measures min, max and mean over the closed group turns', () => {
      const turns = [minuteTurn('a', 0, 6), minuteTurn('b', 6, 14), minuteTurn('c', 14, 21)]

      expect(stationThroughput(turns, 'post-1')).toEqual({
        count: 3,
        maxMs: 8 * 60000,
        meanMs: 7 * 60000,
        minMs: 6 * 60000,
      })
    })

    it('returns nothing before any group turn has closed', () => {
      expect(stationThroughput([minuteTurn('open', 0)], 'post-1')).toBeUndefined()
      expect(stationThroughput([], 'post-1')).toBeUndefined()
    })

    it('guards the mean against a span nobody closed until much later', () => {
      // Three honest turns and one three-hour "turn" — the forgotten end-mark stays out of the mean.
      const turns = [
        minuteTurn('a', 0, 6),
        minuteTurn('b', 6, 13),
        minuteTurn('c', 13, 21),
        turn({ endedAt: '2026-09-12T12:00:00.000Z', id: 'forgotten', startedAt: '2026-09-12T09:00:00.000Z' }),
      ]

      expect(stationThroughput(turns, 'post-1')).toEqual({
        count: 3,
        maxMs: 8 * 60000,
        meanMs: 7 * 60000,
        minMs: 6 * 60000,
      })
    })
  })

  describe('liveStationIds', () => {
    it('lists the posts in first-seen order, once each', () => {
      const turns = [minuteTurn('a', 0, 7), minuteTurn('b', 0, 7, { stationId: 'post-2' }), minuteTurn('c', 7)]

      expect(liveStationIds(turns)).toEqual(['post-1', 'post-2'])
    })
  })

  describe('isStoredStationTurn and toPublicStationTurn', () => {
    it('accepts a complete span, string- or Date-stamped, and rejects partial shapes', () => {
      expect(isStoredStationTurn(turn({}))).toBe(true)
      expect(isStoredStationTurn({ ...turn({}), startedAt: new Date() })).toBe(true)
      expect(isStoredStationTurn({ id: 'x' })).toBe(false)
      expect(isStoredStationTurn(null)).toBe(false)
    })

    it('strips exactly the registration ids', () => {
      expect(toPublicStationTurn(turn({}))).toEqual({
        dogs: [{ name: 'Dog', number: 1 }],
        id: 'turn-1',
        startedAt: '2026-09-12T08:00:00.000Z',
        stationId: 'post-1',
      })
    })
  })
})
