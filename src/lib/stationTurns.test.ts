import type { JsonStationTurn } from '../types'
import {
  completedGroupTurns,
  dogsThrough,
  isBreakTurn,
  isLiveNow,
  isStoredStationTurn,
  isWholeTurn,
  liveStationIds,
  openTurn,
  stationThroughput,
  toPublicStationTurn,
  turnDurationMs,
  waitEstimate,
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

  describe('isWholeTurn', () => {
    it('is a phase span with no dogs, and neither a break nor a turn', () => {
      const briefing = turn({ dogs: [], phase: 'briefing', registrationIds: [] })

      expect(isWholeTurn(briefing)).toBe(true)
      expect(isWholeTurn(turn({ dogs: [], pause: 'coffee', registrationIds: [] }))).toBe(false)
      expect(isWholeTurn(turn({ phase: 'search' }))).toBe(false)
      // It moves nobody through the post and measures nothing.
      const turns = [
        { ...briefing, endedAt: '2026-09-12T08:10:00.000Z' },
        turn({ endedAt: '2026-09-12T08:20:00.000Z', id: 'turn-2', startedAt: '2026-09-12T08:10:00.000Z' }),
      ]
      expect(completedGroupTurns(turns, 'post-1')).toHaveLength(1)
      expect(dogsThrough(turns, 'post-1')).toBe(1)
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

  describe('dogsThrough', () => {
    it('counts dogs rather than turns, so one walk-up moves the queue by four', () => {
      const walkUp = { dogs: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }] }
      const turns = [minuteTurn('a', 0, 6, walkUp), minuteTurn('b', 6, 12), minuteTurn('open', 12)]

      expect(dogsThrough(turns, 'post-1')).toBe(5)
      expect(dogsThrough(turns, 'post-2')).toBe(0)
    })
  })

  describe('waitEstimate', () => {
    const throughput = { count: 3, maxMs: 8 * 60000, meanMs: 7 * 60000, minMs: 6 * 60000 }

    it('divides the queue by the dogs a turn holds before multiplying', () => {
      // Twelve dogs at a post taking four at a time is three turns, not twelve. Getting this
      // backwards overstates the wait fourfold, which is what sends someone home before their turn.
      expect(waitEstimate(throughput, 12, 4)).toEqual({ groupsAhead: 3, maxMs: 24 * 60000, minMs: 18 * 60000 })
      expect(waitEstimate(throughput, 12, 1)).toEqual({ groupsAhead: 12, maxMs: 96 * 60000, minMs: 72 * 60000 })
    })

    it('rounds a part-full last group up to a whole turn', () => {
      expect(waitEstimate(throughput, 9, 4)?.groupsAhead).toBe(3)
    })

    it('withholds the estimate with nothing to go on, and with nobody left to run', () => {
      expect(waitEstimate(undefined, 12, 4)).toBeUndefined()
      expect(waitEstimate(throughput, 0, 4)).toBeUndefined()
      expect(waitEstimate(throughput, -3, 4)).toBeUndefined()
    })

    it('withholds it entirely on open ground, where minutes describe nothing anyone is doing', () => {
      expect(waitEstimate(throughput, 12, 4, 'field')).toBeUndefined()
      expect(waitEstimate(throughput, 12, 4, 'queue')).toBeDefined()
    })
  })

  describe('isLiveNow', () => {
    const now = new Date('2026-09-12T14:00:00+03:00')

    it('is live while a span is open, whenever it was started', () => {
      expect(isLiveNow([turn({ startedAt: '2026-09-11T08:00:00.000Z' })], now)).toBe(true)
    })

    it('stays live between turns for the rest of the day, and goes quiet the next morning', () => {
      const closed = turn({ endedAt: '2026-09-12T05:10:00.000Z', startedAt: '2026-09-12T05:00:00.000Z' })

      expect(isLiveNow([closed], now)).toBe(true)
      expect(isLiveNow([closed], new Date('2026-09-13T06:00:00+03:00'))).toBe(false)
    })

    it('reads the day in Finnish time, so a late evening span is still today', () => {
      // 23:30 Helsinki on the 12th is 20:30Z; the UTC date would already say the 12th, the local one too.
      const late = turn({ endedAt: '2026-09-12T20:40:00.000Z', startedAt: '2026-09-12T20:30:00.000Z' })

      expect(isLiveNow([late], new Date('2026-09-12T23:50:00+03:00'))).toBe(true)
      expect(isLiveNow([late], new Date('2026-09-13T00:10:00+03:00'))).toBe(false)
    })

    it('is quiet with nothing recorded', () => {
      expect(isLiveNow([], now)).toBe(false)
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
