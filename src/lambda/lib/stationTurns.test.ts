import type { JsonConfirmedEvent, JsonRegistration, JsonStationTurn } from '../../types'
import { vi } from 'vitest'

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
    it('accepts the three ops', () => {
      expect(parseStationTurnOp({ type: 'end' })).toEqual({ type: 'end' })
      expect(parseStationTurnOp({ pause: 'lunch', type: 'break' })).toEqual({ pause: 'lunch', type: 'break' })
      expect(parseStationTurnOp({ registrationIds: ['run-1'], type: 'start' })).toEqual({
        registrationIds: ['run-1'],
        type: 'start',
      })
    })

    it.each([
      [null],
      [{ type: 'dance' }],
      [{ pause: 'nap', type: 'break' }],
      [{ registrationIds: [], type: 'start' }],
      [{ registrationIds: [1], type: 'start' }],
      [{ registrationIds: Array.from({ length: 11 }, (_item, i) => `run-${i}`), type: 'start' }],
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

      await saveStationTurns('event-1', expected, next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { turns: next } },
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

      await saveStationTurns('event-1', undefined, next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { turns: next } },
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
