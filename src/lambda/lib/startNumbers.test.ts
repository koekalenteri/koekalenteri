import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { LambdaError } from '../lib/lambda'
import { vi } from 'vitest'
import { asJsonConfirmedEvent } from '../test-utils/helpers'

const mockUpdateRegistrationField = vi.fn()
const mockRemoveRegistrationField = vi.fn()
const mockUpdate = vi.fn()
const mockAudit = vi.fn()

vi.doMock('./registration', () => ({
  removeRegistrationField: mockRemoveRegistrationField,
  updateRegistrationField: mockUpdateRegistrationField,
}))
vi.doMock('./audit', () => ({
  audit: mockAudit,
  registrationAuditKey: ({ eventId, id }: JsonRegistration) => `${eventId}:${id}`,
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { update: mockUpdate }
  }),
}))

const { assignStartNumbers, freezeStartNumbers, setStartNumbersPublishedState } = await import('./startNumbers')

const USER = 'Sihteeri'

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
        'ALO',
        USER
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
      // The dog's own trail says which number went public, and the reserve and the cancelled entry
      // get no line: neither has a number to publish (KOE-1355).
      expect(mockAudit).toHaveBeenCalledTimes(1)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:run-1',
        message: 'Starttinumero julkaistu: 1',
        user: USER,
      })
    })

    it('records the publish in the trail of a dog whose number was already drawn (KOE-1355)', async () => {
      const drawn = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' },
      })

      await freezeStartNumbers('event-1', [drawn], 'ALO', USER)

      // Nothing is written — the snapshot stands — but the number is out now, and the trail says so.
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:run-1',
        message: 'Starttinumero julkaistu: 7',
        user: USER,
      })
    })

    it('keeps a fully entered draw when publishing', async () => {
      const drawn = (id: string, number: number) =>
        registration(id, { startGroup: { date: '2026-09-12', key: 'ALO-AP', number, time: 'ap' } })

      const patches = await freezeStartNumbers('event-1', [drawn('run-1', 7), drawn('run-2', 3)], 'ALO', USER)

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
      await expect(freezeStartNumbers('event-1', [drawn, registration('run-2')], 'ALO', USER)).rejects.toMatchObject({
        body: {
          count: 1,
          error: 'startNumbersIncomplete',
          eventClass: 'ALO',
          message: 'Start numbers are missing for 1 dogs (ALO)',
        },
        status: 422,
      })
      // Nor can an undrawn class freeze beside a drawn one: the number is one dog's in the whole trial.
      await expect(
        freezeStartNumbers('event-1', [drawn, registration('run-3', { class: 'AVO' })], 'AVO', USER)
      ).rejects.toMatchObject({ body: { count: 1, error: 'startNumbersIncomplete', eventClass: 'AVO' }, status: 422 })
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
      await expect(freezeStartNumbers('event-1', [drawn, otherDay], 'ALO', USER)).rejects.toMatchObject({
        body: { error: 'startNumbersIncomplete' },
      })
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

      const patches = await freezeStartNumbers(
        'event-1',
        [friday, strayOnSaturday, saturday],
        'ALO',
        USER,
        '2026-09-12'
      )

      // Friday's draw is complete and already frozen; Saturday's working order stays untouched.
      expect(patches).toEqual([])
      expect(mockUpdateRegistrationField).not.toHaveBeenCalled()
    })

    it('freezes every class when no class is named', async () => {
      const patches = await freezeStartNumbers(
        'event-1',
        [registration('run-1'), registration('run-2', { class: 'AVO' })],
        undefined,
        USER
      )

      expect(patches.map((patch) => patch.id)).toEqual(['run-1', 'run-2'])
    })
  })

  describe('assignStartNumbers', () => {
    it('writes the drawn number over the frozen placement', async () => {
      const frozen = registration('run-1', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 1, time: 'ap' },
      })

      const patches = await assignStartNumbers('event-1', [frozen], [{ id: 'run-1', startNumber: 7 }], USER)

      expect(patches).toEqual([
        { id: 'run-1', startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' } },
      ])
    })

    it('refuses a non-positive number, an unknown dog and a duplicate', async () => {
      const regs = [
        registration('run-1'),
        registration('run-2', { startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 7, time: 'ap' } }),
      ]

      await expect(assignStartNumbers('event-1', regs, [{ id: 'run-1', startNumber: 0 }], USER)).rejects.toThrow(
        "Invalid start number '0'"
      )
      await expect(assignStartNumbers('event-1', regs, [{ id: 'nobody', startNumber: 1 }], USER)).rejects.toThrow(
        "Registration 'nobody' not found"
      )
      // The duplicate the server refuses is the one two phones would otherwise both claim.
      await expect(assignStartNumbers('event-1', regs, [{ id: 'run-1', startNumber: 7 }], USER)).rejects.toThrow(
        'Start number 7 is already taken'
      )
      await expect(
        assignStartNumbers(
          'event-1',
          regs,
          [
            { id: 'run-1', startNumber: 3 },
            { id: 'run-2', startNumber: 3 },
          ],
          USER
        )
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
        assignStartNumbers('event-1', [friday, saturday], [{ id: 'run-2', startNumber: 7 }], USER)
      ).rejects.toThrow('Start number 7 is already taken')
      await expect(
        assignStartNumbers('event-1', [friday, otherClass], [{ id: 'run-3', startNumber: 7 }], USER)
      ).rejects.toThrow('Start number 7 is already taken')
    })

    /**
     * The sheet that hits this is often a class secretary's link: one class of one day, on which the
     * dog holding the number does not appear at all. Naming the number and its class is what lets
     * the refusal be acted on rather than puzzled over (KOE-1267).
     */
    it('names the refused number and the class holding it', async () => {
      const holder = registration('run-1', {
        class: 'AVO',
        startGroup: { date: '2026-09-12', key: 'AVO-AP', number: 3, time: 'ap' },
      })
      const asking = registration('run-2', { class: 'ALO' })

      const taken = await assignStartNumbers('event-1', [holder, asking], [{ id: 'run-2', startNumber: 3 }], USER)
        .then(() => undefined)
        .catch((error: LambdaError) => error)

      expect((taken as LambdaError).body).toEqual({
        error: 'startNumberTaken',
        eventClass: 'AVO',
        message: 'Start number 3 is already taken',
        number: 3,
      })

      const twice = await assignStartNumbers(
        'event-1',
        [registration('run-3'), registration('run-4')],
        [
          { id: 'run-3', startNumber: 5 },
          { id: 'run-4', startNumber: 5 },
        ],
        USER
      )
        .then(() => undefined)
        .catch((error: LambdaError) => error)

      expect((twice as LambdaError).body).toEqual({
        error: 'startNumberAssignedTwice',
        message: 'Start number 5 assigned twice',
        number: 5,
      })
    })

    it('lets a cancelled holder yield its number, which fills the vacated place properly', async () => {
      const cancelled = registration('can-2', {
        cancelled: true,
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' },
      })
      const riser = registration('run-1')

      const patches = await assignStartNumbers('event-1', [riser, cancelled], [{ id: 'run-1', startNumber: 5 }], USER)

      // The POISSA row disappears from the public list "kunnolla": the number now belongs to the
      // dog that took the place. Yielding is a REMOVE expression — DynamoDB refuses a SET to
      // undefined — and the patch carries `null` so patchMerge on the clients deletes the field.
      expect(patches).toEqual([
        { id: 'can-2', startGroup: null },
        { id: 'run-1', startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' } },
      ])
      expect(mockRemoveRegistrationField).toHaveBeenCalledWith('event-1', 'can-2', 'startGroup')
      expect(mockUpdateRegistrationField).not.toHaveBeenCalledWith('event-1', 'can-2', 'startGroup', undefined)
      // Losing the number is as much a fact about the cancelled dog as gaining it is about the riser.
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:can-2',
        message: 'Starttinumero vapautettu: 5',
        user: USER,
      })
    })

    /**
     * Cancelling is the common way off the participant list, not the only one. A dog moved back to
     * the reserve list will not start under its drawn number either, and nothing else releases it:
     * the groups endpoint never touches `startGroup`. Left as it was, the number was unusable by
     * anyone and invisible to everyone — the sheet does not show a dog that is off the list
     * (KOE-1428).
     */
    it('lets a holder moved back to the reserve list yield its number just the same', async () => {
      const demoted = registration('res-2', {
        group: { key: 'reserve', number: 1 },
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' },
      })
      const riser = registration('run-1')

      const patches = await assignStartNumbers('event-1', [riser, demoted], [{ id: 'run-1', startNumber: 5 }], USER)

      expect(patches).toEqual([
        { id: 'res-2', startGroup: null },
        { id: 'run-1', startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 5, time: 'ap' } },
      ])
      expect(mockRemoveRegistrationField).toHaveBeenCalledWith('event-1', 'res-2', 'startGroup')
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:res-2',
        message: 'Starttinumero vapautettu: 5',
        user: USER,
      })
    })

    /** A dog that is still running keeps its number: yielding is about leaving the list, not about
     * being asked nicely. */
    it('still refuses a number a running dog holds', async () => {
      const holder = registration('run-2', {
        class: 'AVO',
        startGroup: { date: '2026-09-12', key: 'AVO-AP', number: 5, time: 'ap' },
      })

      await expect(
        assignStartNumbers('event-1', [registration('run-1'), holder], [{ id: 'run-1', startNumber: 5 }], USER)
      ).rejects.toMatchObject({ body: { error: 'startNumberTaken', eventClass: 'AVO', number: 5 }, status: 422 })
      expect(mockRemoveRegistrationField).not.toHaveBeenCalled()
    })

    it("records the entered number in the dog's own trail (KOE-1355)", async () => {
      const undrawn = registration('run-1')
      const corrected = registration('run-2', {
        startGroup: { date: '2026-09-12', key: 'ALO-AP', number: 9, time: 'ap' },
      })

      await assignStartNumbers(
        'event-1',
        [undrawn, corrected],
        [
          { id: 'run-1', startNumber: 4 },
          { id: 'run-2', startNumber: 13 },
        ],
        USER
      )

      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:run-1',
        message: 'Starttinumero tallennettu: 4',
        user: USER,
      })
      // A corrected number reads as the correction it is, which is what the work list showed.
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:run-2',
        message: 'Starttinumero tallennettu: 9 -> 13',
        user: USER,
      })
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
