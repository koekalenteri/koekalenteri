import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'

const mockUpdateRegistrationField = vi.fn()
const mockRemoveRegistrationField = vi.fn()
const mockUpdate = vi.fn()

vi.doMock('./registration', () => ({
  removeRegistrationField: mockRemoveRegistrationField,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { update: mockUpdate }
  }),
}))

const { assignStartNumbers, freezeStartNumbers, setStartNumbersPublishedState } = await import('./startNumbers')

const registration = (id: string, overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    class: 'ALO',
    eventId: 'event-1',
    eventType: 'NOME-B',
    group: { date: '2026-09-12', key: 'ALO-AP', number: Number(id.slice(-1)), time: 'ap' },
    id,
    ...overrides,
  }) as JsonRegistration

describe('startNumbers', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('freezeStartNumbers', () => {
    it("snapshots each participant's current group, for the class being published", async () => {
      const patches = await freezeStartNumbers(
        'event-1',
        [
          registration('run-1'),
          registration('run-2', { class: 'AVO' }),
          // Nothing to freeze for a reserve or a cancelled entry: they hold no start slot.
          registration('res-3', { group: { key: 'reserve', number: 1 } } as Partial<JsonRegistration>),
          registration('can-4', { cancelled: true }),
        ],
        'ALO'
      )

      expect(patches).toEqual([
        { id: 'run-1', startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 1, time: 'ap' } },
      ])
      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('event-1', 'run-1', 'startGroup', {
        date: '2026-09-12',
        key: 'ALO-AP',
        number: 1,
        time: 'ap',
      })
    })

    it('keeps a fully entered draw when publishing', async () => {
      const drawn = (id: string, number: number) =>
        registration(id, { startGroup: { date: '2026-09-12', key: 'ALO-AP', number, time: 'ap' } })

      const patches = await freezeStartNumbers('event-1', [drawn('run-1', 7), drawn('run-2', 3)], 'ALO')

      // Freezing over an existing snapshot would replace the venue's drawn numbers with the working
      // order in the same request that makes them public (KOE-1218).
      expect(patches).toEqual([])
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    })

    it('refuses to publish a day whose draw covers only part of the class', async () => {
      const drawn = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' },
      })

      // The gap would freeze to its working-order number, which can collide with a drawn one on the
      // same day's public list. Refusing names the fix: enter the missing number and publish again.
      // The code is structured so the client can show that fix instead of a generic failure (KOE-1218).
      await expect(freezeStartNumbers('event-1', [drawn, registration('run-2')], 'ALO')).rejects.toThrow(
        /startNumbersIncomplete.*Start numbers are missing for 1 dogs \(ALO 2026-09-12\)/
      )
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    })

    it('freezes an undrawn day beside a fully drawn one', async () => {
      const drawn = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' },
      })
      const otherDay = registration('run-2', {
        group: { date: '2026-09-13', key: 'ALO-AP', number: 2, time: 'ap' },
      })

      // Uniqueness is scoped to class and day, so the days publish independently.
      const patches = await freezeStartNumbers('event-1', [drawn, otherDay], 'ALO')

      expect(patches).toEqual([
        { id: 'run-2', startGroup: { date: '2026-09-13', key: 'ALO-AP', number: 2, time: 'ap' } },
      ])
    })

    it('freezes every class when no class is named', async () => {
      const patches = await freezeStartNumbers(
        'event-1',
        [registration('run-1'), registration('run-2', { class: 'AVO' })],
        undefined
      )

      expect(patches.map((patch) => patch.id)).toEqual(['run-1', 'run-2'])
    })
  })

  describe('assignStartNumbers', () => {
    it('writes the drawn number over the frozen placement', async () => {
      const frozen = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 1, time: 'ap' },
      })

      const patches = await assignStartNumbers('event-1', [frozen], [{ id: 'run-1', startNumber: 7 }])

      expect(patches).toEqual([
        { id: 'run-1', startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' } },
      ])
    })

    it('refuses a non-positive number, an unknown dog and a duplicate', async () => {
      const regs = [
        registration('run-1'),
        registration('run-2', { startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' } }),
      ]

      await expect(assignStartNumbers('event-1', regs, [{ id: 'run-1', startNumber: 0 }])).rejects.toThrow(
        "Invalid start number '0'"
      )
      await expect(assignStartNumbers('event-1', regs, [{ id: 'nobody', startNumber: 1 }])).rejects.toThrow(
        "Registration 'nobody' not found"
      )
      // The duplicate the server refuses is the one two phones would otherwise both claim.
      await expect(assignStartNumbers('event-1', regs, [{ id: 'run-1', startNumber: 7 }])).rejects.toThrow(
        'Start number 7 is already taken'
      )
      await expect(
        assignStartNumbers('event-1', regs, [
          { id: 'run-1', startNumber: 3 },
          { id: 'run-2', startNumber: 3 },
        ])
      ).rejects.toThrow('Start number 3 assigned twice')
    })

    it('lets a cancelled holder yield its number, which fills the vacated place properly', async () => {
      const cancelled = registration('can-2', {
        cancelled: true,
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' },
      })
      const riser = registration('run-1')

      const patches = await assignStartNumbers('event-1', [riser, cancelled], [{ id: 'run-1', startNumber: 5 }])

      // The POISSA row disappears from the public list "kunnolla": the number now belongs to the
      // dog that took the place. Yielding is a REMOVE expression — DynamoDB refuses a SET to
      // undefined — and the patch carries `null` so patchMerge on the clients deletes the field.
      expect(patches).toEqual([
        { id: 'can-2', startGroup: null },
        { id: 'run-1', startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' } },
      ])
      expect(mockRemoveRegistrationField).toHaveBeenCalledWith('event-1', 'can-2', 'startGroup')
      expect(mockUpdateRegistrationField).not.toHaveBeenCalledWith('event-1', 'can-2', 'startGroup', undefined)
    })
  })

  describe('setStartNumbersPublishedState', () => {
    it('flips the class entry in the map and writes it to the event', async () => {
      const confirmedEvent = {
        classes: [{ class: 'ALO' }, { class: 'AVO' }],
        id: 'event-1',
        startNumbersPublished: false,
      } as unknown as JsonConfirmedEvent

      const state = await setStartNumbersPublishedState(confirmedEvent, 'ALO', true)

      expect(state).toEqual({ ALO: true, AVO: false })
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { startNumbersPublished: { ALO: true, AVO: false } } },
        expect.anything()
      )
    })
  })
})
