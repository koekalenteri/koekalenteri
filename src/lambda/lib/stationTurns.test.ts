import type { JsonConfirmedEvent, JsonRegistration, JsonStationTurn, StationTurnOp } from '../../types'
import { vi } from 'vitest'
import { stationPhases } from '../../lib/liveFormat'

const mockRead = vi.fn()
const mockUpdate = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: mockRead, update: mockUpdate }
  }),
}))

const { applyStationTurnOp, parseStationTurnOp, saveStationTurns, writeStationTurn } = await import('./stationTurns')

const NOW = new Date('2026-09-12T08:30:00.000Z')

const registration = (id: string, overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    class: 'ALO',
    dog: { name: `Dog ${id}` },
    eventId: 'event-1',
    eventType: 'NOWT',
    group: { date: '2026-09-12', key: 'ALO-AP', number: Number(id.slice(-1)), time: 'ap' },
    id,
    ...overrides,
  }) as JsonRegistration

const storedTurn = (overrides: Partial<JsonStationTurn> = {}): JsonStationTurn => ({
  dogs: [{ name: 'Dog run-1', number: 1 }],
  id: 'turn-1',
  registrationIds: ['run-1'],
  startedAt: '2026-09-12T08:00:00.000Z',
  stationId: 'post-1',
  ...overrides,
})

describe('stationTurns', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('parseStationTurnOp', () => {
    it('accepts every op', () => {
      expect(parseStationTurnOp({ type: 'end' })).toEqual({ type: 'end' })
      expect(parseStationTurnOp({ type: 'next' })).toEqual({ type: 'next' })
      expect(parseStationTurnOp({ pause: 'lunch', type: 'break' })).toEqual({ pause: 'lunch', type: 'break' })
      expect(parseStationTurnOp({ registrationIds: ['run-1'], type: 'start' })).toEqual({
        registrationIds: ['run-1'],
        type: 'start',
      })
      expect(parseStationTurnOp({ phase: 'search', registrationIds: ['run-1'], type: 'start' })).toEqual({
        phase: 'search',
        registrationIds: ['run-1'],
        type: 'start',
      })
      // An empty group is a whole-entry phase's — whether this phase is one, the apply step knows.
      expect(parseStationTurnOp({ phase: 'briefing', registrationIds: [], type: 'start' })).toEqual({
        phase: 'briefing',
        registrationIds: [],
        type: 'start',
      })
      expect(parseStationTurnOp({ index: 2, mark: 'eyeWipe', type: 'mark' })).toEqual({
        index: 2,
        mark: 'eyeWipe',
        type: 'mark',
      })
    })

    it.each([
      [null],
      [{ type: 'dance' }],
      [{ pause: 'nap', type: 'break' }],
      [{ registrationIds: [], type: 'start' }],
      [{ registrationIds: [1], type: 'start' }],
      [{ registrationIds: Array.from({ length: 11 }, (_item, i) => `run-${i}`), type: 'start' }],
      [{ phase: '', registrationIds: ['run-1'], type: 'start' }],
      [{ phase: 'x'.repeat(41), registrationIds: ['run-1'], type: 'start' }],
      [{ phase: 1, registrationIds: ['run-1'], type: 'start' }],
      [{ index: 0, mark: 'wagged', type: 'mark' }],
      [{ index: -1, mark: 'gotRetrieve', type: 'mark' }],
      [{ index: 10, mark: 'gotRetrieve', type: 'mark' }],
      [{ mark: 'gotRetrieve', type: 'mark' }],
    ])('refuses %j with 422', (body) => {
      expect(() => parseStationTurnOp(body)).toThrow(expect.objectContaining({ status: 422 }))
    })
  })

  describe('applyStationTurnOp', () => {
    it('starts a turn with the public dog line frozen from the start-list placement', () => {
      const turns = applyStationTurnOp(
        [],
        [registration('run-1', { startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' } })],
        'post-1',
        { registrationIds: ['run-1'], type: 'start' },
        NOW
      )

      expect(turns).toEqual([
        {
          dogs: [{ name: 'Dog run-1', number: 5 }],
          id: expect.any(String),
          registrationIds: ['run-1'],
          startedAt: NOW.toISOString(),
          stationId: 'post-1',
        },
      ])
    })

    it('closes the open span when the next thing starts, on this post only', () => {
      const open = storedTurn()
      const otherPost = storedTurn({ id: 'turn-2', stationId: 'post-2' })

      const turns = applyStationTurnOp(
        [open, otherPost],
        [registration('run-2')],
        'post-1',
        { registrationIds: ['run-2'], type: 'start' },
        NOW
      )

      expect(turns[0]).toEqual({ ...open, endedAt: NOW.toISOString() })
      expect(turns[1]).toEqual(otherPost)
      expect(turns[2].registrationIds).toEqual(['run-2'])
    })

    describe('a day in phases', () => {
      const phases = stationPhases('NOU')
      const start = (op: Partial<Extract<StationTurnOp, { type: 'start' }>>, turns: JsonStationTurn[] = []) =>
        applyStationTurnOp(
          turns,
          [registration('run-1')],
          '1',
          { registrationIds: ['run-1'], type: 'start', ...op },
          NOW,
          phases
        )

      it('records the phase a run starts in, with when', () => {
        expect(start({ phase: 'waterMark' })[0]).toMatchObject({
          dogs: [{ name: 'Dog run-1', number: 1 }],
          phases: [{ key: 'waterMark', startedAt: NOW.toISOString() }],
        })
      })

      it('moves the open run on to the next phase inside the same span, and no further than the last', () => {
        const later = new Date('2026-09-12T08:40:00.000Z')
        const moved = applyStationTurnOp(start({ phase: 'waterMark' }), [], '1', { type: 'next' }, later, phases)

        expect(moved).toHaveLength(1)
        expect(moved[0]).toMatchObject({
          phases: [
            { key: 'waterMark', startedAt: NOW.toISOString() },
            { key: 'search', startedAt: later.toISOString() },
          ],
        })
        expect(moved[0].endedAt).toBeUndefined()
        expect(() => applyStationTurnOp(moved, [], '1', { type: 'next' }, later, phases)).toThrow(
          expect.objectContaining({ status: 422 })
        )
      })

      it('refuses to move on with nothing running, over a break, or at the briefing', () => {
        const briefing = start({ phase: 'briefing', registrationIds: [] })
        const onBreak = applyStationTurnOp([], [], '1', { pause: 'coffee', type: 'break' }, NOW, phases)

        for (const turns of [[], briefing, onBreak]) {
          expect(() => applyStationTurnOp(turns, [], '1', { type: 'next' }, NOW, phases)).toThrow(
            expect.objectContaining({ status: 422 })
          )
        }
      })

      it('holds the whole entry at the briefing as a span with no dogs', () => {
        expect(start({ phase: 'briefing', registrationIds: [] })[0]).toMatchObject({
          dogs: [],
          phases: [{ key: 'briefing', startedAt: NOW.toISOString() }],
          registrationIds: [],
        })
      })

      it('refuses dogs at the briefing, an empty search, and a phase the day does not have', () => {
        expect(() => start({ phase: 'briefing' })).toThrow(expect.objectContaining({ status: 422 }))
        expect(() => start({ phase: 'search', registrationIds: [] })).toThrow(expect.objectContaining({ status: 422 }))
        expect(() => start({ phase: 'lunch' })).toThrow(expect.objectContaining({ status: 422 }))
      })

      it('takes a phase only from a post that has phases', () => {
        expect(() =>
          applyStationTurnOp(
            [],
            [registration('run-1')],
            'post-1',
            { phase: 'search', registrationIds: ['run-1'], type: 'start' },
            NOW
          )
        ).toThrow(expect.objectContaining({ status: 422 }))
      })
    })

    it('starts a walk-up as one span holding the whole group', () => {
      const turns = applyStationTurnOp(
        [],
        [registration('run-1'), registration('run-2'), registration('run-3'), registration('run-4')],
        'post-1',
        { registrationIds: ['run-1', 'run-2', 'run-3', 'run-4'], type: 'start' },
        NOW
      )

      expect(turns).toHaveLength(1)
      expect(turns[0].dogs).toHaveLength(4)
    })

    it('marks one dog of the open group without ending the span', () => {
      const open = storedTurn({ dogs: [{ name: 'Dog run-1' }, { name: 'Dog run-2' }] })

      const turns = applyStationTurnOp([open], [], 'post-1', { index: 1, mark: 'gotRetrieve', type: 'mark' }, NOW)

      expect(turns[0]).toEqual({ ...open, dogs: [{ name: 'Dog run-1' }, { mark: 'gotRetrieve', name: 'Dog run-2' }] })
      expect(turns[0].endedAt).toBeUndefined()
    })

    it('refuses a mark with no open span, or with no such dog in it', () => {
      const open = storedTurn()

      expect(() => applyStationTurnOp([], [], 'post-1', { index: 0, mark: 'gotRetrieve', type: 'mark' }, NOW)).toThrow(
        expect.objectContaining({ status: 422 })
      )
      expect(() =>
        applyStationTurnOp([open], [], 'post-1', { index: 3, mark: 'gotRetrieve', type: 'mark' }, NOW)
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('records a break as a turn with no dogs', () => {
      const turns = applyStationTurnOp([], [], 'post-1', { pause: 'coffee', type: 'break' }, NOW)

      expect(turns).toEqual([
        {
          dogs: [],
          id: expect.any(String),
          pause: 'coffee',
          registrationIds: [],
          startedAt: NOW.toISOString(),
          stationId: 'post-1',
        },
      ])
    })

    it('ends the open span and refuses to end when nothing is open', () => {
      const open = storedTurn()

      expect(applyStationTurnOp([open], [], 'post-1', { type: 'end' }, NOW)).toEqual([
        { ...open, endedAt: NOW.toISOString() },
      ])
      expect(() => applyStationTurnOp([], [], 'post-1', { type: 'end' }, NOW)).toThrow(
        expect.objectContaining({ status: 422 })
      )
    })

    it('refuses a dog that does not exist or has cancelled', () => {
      expect(() =>
        applyStationTurnOp([], [registration('run-1')], 'post-1', { registrationIds: ['ghost'], type: 'start' }, NOW)
      ).toThrow(expect.objectContaining({ status: 422 }))
      expect(() =>
        applyStationTurnOp(
          [],
          [registration('run-1', { cancelled: true })],
          'post-1',
          { registrationIds: ['run-1'], type: 'start' },
          NOW
        )
      ).toThrow(expect.objectContaining({ status: 422 }))
    })
  })

  describe('saveStationTurns', () => {
    it('conditions the write on the timeline it was derived from', async () => {
      const expected = [storedTurn()]
      const next = [storedTurn({ endedAt: NOW.toISOString() })]

      await saveStationTurns('event-1', expected, next, NOW)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { turns: next, updatedAt: NOW.toISOString() } },
        'event-table-not-found-in-env',
        undefined,
        {
          expression: '#turns = :expected',
          names: { '#turns': 'turns' },
          values: { ':expected': expected },
        }
      )
    })

    it('requires the attribute to be absent for the first span of the day', async () => {
      const next = [storedTurn()]

      await saveStationTurns('event-1', undefined, next, NOW)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { turns: next, updatedAt: NOW.toISOString() } },
        'event-table-not-found-in-env',
        undefined,
        {
          expression: 'attribute_not_exists(#turns)',
          names: { '#turns': 'turns' },
        }
      )
    })
  })

  describe('writeStationTurn', () => {
    const confirmedEvent = { id: 'event-1' } as JsonConfirmedEvent

    it('re-reads and re-applies after losing the race, keeping both spans', async () => {
      const winner = storedTurn({ id: 'winner' })
      mockUpdate.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'ConditionalCheckFailedException' }))
      mockRead.mockResolvedValueOnce({ id: 'event-1', turns: [winner] })

      const turns = await writeStationTurn(confirmedEvent, [], 'post-1', { pause: 'coffee', type: 'break' }, NOW)

      // The break closed the racing winner's open span instead of overwriting it away.
      expect(turns[0]).toEqual({ ...winner, endedAt: NOW.toISOString() })
      expect(turns[1].pause).toBe('coffee')
      expect(mockUpdate).toHaveBeenCalledTimes(2)
    })

    it('gives up after repeated lost races', async () => {
      mockUpdate.mockRejectedValue(Object.assign(new Error('nope'), { name: 'ConditionalCheckFailedException' }))
      mockRead.mockResolvedValue({ id: 'event-1', turns: [] })

      await expect(
        writeStationTurn(confirmedEvent, [], 'post-1', { pause: 'coffee', type: 'break' }, NOW)
      ).rejects.toThrow('nope')
      expect(mockUpdate).toHaveBeenCalledTimes(3)
    })

    it('passes other errors through untouched', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('boom'))

      await expect(
        writeStationTurn(confirmedEvent, [], 'post-1', { pause: 'lunch', type: 'break' }, NOW)
      ).rejects.toThrow('boom')
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })
  })
})
