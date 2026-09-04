import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent } from '../test-utils/helpers'

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
        /startNumbersIncomplete.*Start numbers are missing for 1 dogs \(ALO\)/
      )
      // Nor can an undrawn class freeze beside a drawn one: the number is one dog's in the whole trial.
      await expect(
        freezeStartNumbers('event-1', [drawn, registration('run-3', { class: 'AVO' })], 'AVO')
      ).rejects.toThrow(/startNumbersIncomplete.*Start numbers are missing for 1 dogs \(AVO\)/)
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    })

    it('refuses to freeze an undrawn day beside a drawn one when the whole class is published', async () => {
      const drawn = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' },
      })
      const otherDay = registration('run-2', {
        group: { date: '2026-09-13', key: 'ALO-AP', number: 2, time: 'ap' },
      })

      // A number belongs to one dog across every day of the class (KOE-1303), so Saturday's working
      // order could collide with Friday's draw. The days publish one at a time instead (KOE-1304).
      await expect(freezeStartNumbers('event-1', [drawn, otherDay], 'ALO')).rejects.toThrow(/startNumbersIncomplete/)
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    })

    it('freezes only the named day, and lets a stray number on the other day be (KOE-1304)', async () => {
      const friday = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' },
      })
      // Saturday's draw is tomorrow morning; one number typed in by accident must not block Friday.
      const strayOnSaturday = registration('run-2', {
        group: { date: '2026-09-13', key: 'ALO-AP', number: 2, time: 'ap' },
        startGroup: { date: '2026-09-13', key: 'ALO-AP', number: 30, time: 'ap' },
      })
      const saturday = registration('run-3', {
        group: { date: '2026-09-13', key: 'ALO-AP', number: 3, time: 'ap' },
      })

      const patches = await freezeStartNumbers('event-1', [friday, strayOnSaturday, saturday], 'ALO', '2026-09-12')

      // Friday's draw is complete and already frozen; Saturday's working order stays untouched.
      expect(patches).toEqual([])
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
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

    it('refuses a number any dog of the trial already holds, on another day or in another class (KOE-1303)', async () => {
      const friday = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' },
      })
      const saturday = registration('run-2', {
        group: { date: '2026-09-13', key: 'ALO-AP', number: 2, time: 'ap' },
      })
      const otherClass = registration('run-3', { class: 'AVO' })

      // Friday 1–24, Saturday 25–48: one number, one dog, whichever day or class it runs in.
      await expect(
        assignStartNumbers('event-1', [friday, saturday], [{ id: 'run-2', startNumber: 7 }])
      ).rejects.toThrow('Start number 7 is already taken')
      await expect(
        assignStartNumbers('event-1', [friday, otherClass], [{ id: 'run-3', startNumber: 7 }])
      ).rejects.toThrow('Start number 7 is already taken')
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
    it('publishes a multi-day class one day at a time (KOE-1304)', async () => {
      const twoDays = (startNumbersPublished: JsonConfirmedEvent['startNumbersPublished']) =>
        asJsonConfirmedEvent({
          classes: [
            { class: 'ALO', date: '2026-09-12' },
            { class: 'ALO', date: '2026-09-13' },
            { class: 'AVO', date: '2026-09-12' },
          ],
          endDate: '2026-09-13',
          id: 'event-1',
          startDate: '2026-09-12',
          startNumbersPublished,
        })

      // Friday out: the class holds a day list, the other class is untouched.
      expect(
        (await setStartNumbersPublishedState(twoDays({ ALO: false, AVO: false }), 'ALO', true, '2026-09-12'))
          .startNumbersPublished
      ).toEqual({ ALO: ['2026-09-12'], AVO: false })
      // Saturday out too: the list covers every day the class runs, so it collapses to plain true.
      expect(
        (await setStartNumbersPublishedState(twoDays({ ALO: ['2026-09-12'], AVO: false }), 'ALO', true, '2026-09-13'))
          .startNumbersPublished
      ).toEqual({ ALO: true, AVO: false })
      // Hiding one day of a fully published class expands it back into the days that stay out.
      expect(
        (await setStartNumbersPublishedState(twoDays({ ALO: true, AVO: false }), 'ALO', false, '2026-09-12'))
          .startNumbersPublished
      ).toEqual({ ALO: ['2026-09-13'], AVO: false })
      // And hiding the last day is plain false.
      expect(
        (await setStartNumbersPublishedState(twoDays({ ALO: ['2026-09-13'], AVO: false }), 'ALO', false, '2026-09-13'))
          .startNumbersPublished
      ).toEqual({ ALO: false, AVO: false })
    })

    it('publishes one day of a classless event against its own dates', async () => {
      const confirmedEvent = asJsonConfirmedEvent({
        classes: [],
        endDate: '2026-09-13',
        id: 'event-1',
        startDate: '2026-09-12',
        startNumbersPublished: false,
      })

      const now = new Date('2026-09-11T09:00:00.000Z')
      expect(
        (await setStartNumbersPublishedState(confirmedEvent, undefined, true, '2026-09-12', now)).startNumbersPublished
      ).toEqual(['2026-09-12'])
      // `updatedAt` moves so the change reaches a browser that already holds the event (KOE-1352).
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { startNumbersPublished: ['2026-09-12'], updatedAt: '2026-09-11T09:00:00.000Z' } },
        expect.anything()
      )
    })

    it('flips the class entry in the map and writes it to the event', async () => {
      const confirmedEvent = asJsonConfirmedEvent({
        classes: [{ class: 'ALO' }, { class: 'AVO' }],
        id: 'event-1',
        startNumbersPublished: false,
      })

      const now = new Date('2026-09-11T09:00:00.000Z')
      const state = await setStartNumbersPublishedState(confirmedEvent, 'ALO', true, undefined, now)

      expect(state).toEqual({
        startNumbersPublished: { ALO: true, AVO: false },
        updatedAt: '2026-09-11T09:00:00.000Z',
      })
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { startNumbersPublished: { ALO: true, AVO: false }, updatedAt: '2026-09-11T09:00:00.000Z' } },
        expect.anything()
      )
    })
  })
})
