import type { JsonRegistration, RegistrationClass } from '../../types'
import type { LambdaError } from '../lib/lambda'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import {
  assertEntriesInClassSpace,
  authorizeStartNumberLink,
  classNumberSpace,
  classStartNumbersResponse,
  deriveStartNumberLinkToken,
  getStartNumberLinkToken,
  reservedStartNumbers,
  startNumberLinkClasses,
} from './startNumberLink'

const confirmedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO' }, { class: 'AVO' }],
  endDate: '2026-09-12',
  eventType: 'NOWT',
  id: 'event-1',
  location: 'Ranua',
  name: 'Syyskoe',
  startDate: '2026-09-12',
})

const headers = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} })

/** The working order numbers every participant of the trial in one run: ALO 1–2, then AVO 3–4. */
const dog = (id: string, eventClass: RegistrationClass, number: number, overrides: Partial<JsonRegistration> = {}) =>
  asJsonRegistration({
    class: eventClass,
    dog: { name: `Koira ${number}`, regNo: `REG-${number}` },
    eventId: 'event-1',
    eventType: 'NOWT',
    group: { date: '2026-09-12', key: `${eventClass}-AP`, number, time: 'ap' },
    handler: { email: 'handler@example.com', name: `Ohjaaja ${number}` },
    id,
    ...overrides,
  })

const registrations = [dog('alo-1', 'ALO', 1), dog('alo-2', 'ALO', 2), dog('avo-1', 'AVO', 3), dog('avo-2', 'AVO', 4)]

describe('startNumberLink', () => {
  describe('tokens', () => {
    it('changes with the class version, which is what revocation is', () => {
      const before = deriveStartNumberLinkToken('event-1', 'ALO', 1, 'secret')
      const after = deriveStartNumberLinkToken('event-1', 'ALO', 2, 'secret')

      expect(before).not.toEqual(after)
    })

    it('gives each class its own token, so one secretary cannot open another class', () => {
      expect(deriveStartNumberLinkToken('event-1', 'ALO', 1, 'secret')).not.toEqual(
        deriveStartNumberLinkToken('event-1', 'AVO', 1, 'secret')
      )
    })

    it('opens the class for the right token only', async () => {
      const token = await getStartNumberLinkToken('event-1', confirmedEvent, 'ALO')

      await expect(authorizeStartNumberLink(headers(token), 'event-1', confirmedEvent, 'ALO')).resolves.toBe('ALO')
      await expect(authorizeStartNumberLink(headers(token), 'event-1', confirmedEvent, 'AVO')).rejects.toThrow(
        'not found'
      )
      await expect(authorizeStartNumberLink(headers('wrong'), 'event-1', confirmedEvent, 'ALO')).rejects.toThrow(
        'not found'
      )
      await expect(authorizeStartNumberLink(headers(), 'event-1', confirmedEvent, 'ALO')).rejects.toThrow('not found')
    })

    it('stops opening once the class version has been bumped', async () => {
      const token = await getStartNumberLinkToken('event-1', confirmedEvent, 'ALO')
      const revoked = { ...confirmedEvent, startNumberLinkVersions: { ALO: 2 } }

      await expect(authorizeStartNumberLink(headers(token), 'event-1', revoked, 'ALO')).rejects.toThrow('not found')
      // Only that class's links die; the other secretaries are still drawing.
      await expect(
        authorizeStartNumberLink(
          headers(await getStartNumberLinkToken('event-1', revoked, 'AVO')),
          'event-1',
          revoked,
          'AVO'
        )
      ).resolves.toBe('AVO')
    })

    it('has no class to open where the trial runs none, and offers its event type instead', () => {
      expect(startNumberLinkClasses(confirmedEvent)).toEqual(['ALO', 'AVO'])
      expect(startNumberLinkClasses({ classes: [], eventType: 'NOU' })).toEqual(['NOU'])
    })
  })

  describe('classNumberSpace', () => {
    it('is the working order numbers the class holds', () => {
      expect(classNumberSpace(registrations, 'ALO')).toEqual([1, 2])
      expect(classNumberSpace(registrations, 'AVO')).toEqual([3, 4])
    })

    it('leaves out a dog that is not running: a reserve has no slot to draw for', () => {
      const reserve = dog('alo-3', 'ALO', 3, { group: { key: 'reserve', number: 1 } })

      expect(classNumberSpace([...registrations, reserve], 'ALO')).toEqual([1, 2])
    })
  })

  describe('assertEntriesInClassSpace', () => {
    it('accepts the class drawing its own numbers among its own dogs', () => {
      expect(() =>
        assertEntriesInClassSpace(registrations, 'ALO', [
          { id: 'alo-1', startNumber: 2 },
          { id: 'alo-2', startNumber: 1 },
        ])
      ).not.toThrow()
    })

    // The code and the number travel in the body, which is what the entry form reads to say which
    // number it was; the message is for the log (KOE-1267).
    it('refuses a number that belongs to another class, and names it', () => {
      const refused = (() => {
        try {
          assertEntriesInClassSpace(registrations, 'ALO', [{ id: 'alo-1', startNumber: 3 }])
        } catch (error) {
          return error as LambdaError
        }
      })()

      expect(refused?.status).toBe(422)
      expect(refused?.body).toEqual({
        error: 'startNumberOutsideClass',
        message: "Start number 3 is not one of ALO's working order numbers",
        number: 3,
      })
    })

    it("refuses another class's dog", () => {
      expect(() => assertEntriesInClassSpace(registrations, 'ALO', [{ id: 'avo-1', startNumber: 1 }])).toThrow(
        'does not run in ALO'
      )
    })
  })

  describe('reservedStartNumbers', () => {
    const drawn = (id: string, eventClass: RegistrationClass, number: number, startNumber: number) =>
      dog(id, eventClass, number, {
        startGroup: { date: '2026-09-12', key: `${eventClass}-AP`, number: startNumber, time: 'ap' },
      })

    /**
     * The case the class secretary hit: the working order handed ALO a number that an AVO dog had
     * already drawn, and her link shows no AVO dog to explain it (KOE-1267).
     */
    it('names each number another class has drawn, and the class holding it', () => {
      const reserved = reservedStartNumbers([dog('alo-1', 'ALO', 1), drawn('avo-1', 'AVO', 3, 1)], 'ALO')

      expect(reserved).toEqual([{ eventClass: 'AVO', number: 1 }])
    })

    it("leaves out the class's own dogs, which are on the sheet already", () => {
      expect(reservedStartNumbers([drawn('alo-1', 'ALO', 1, 2), drawn('alo-2', 'ALO', 2, 1)], 'ALO')).toEqual([])
    })

    it('leaves out a number nobody has drawn yet', () => {
      expect(reservedStartNumbers(registrations, 'ALO')).toEqual([])
    })

    // What keeps this list exactly as strict as the write it predicts: a cancelled holder yields its
    // number when the save comes, so the number is free and saying otherwise would be a lie.
    it('leaves out a cancelled holder, whose number the save would yield anyway', () => {
      const cancelled = drawn('avo-1', 'AVO', 3, 1)

      expect(reservedStartNumbers([{ ...cancelled, cancelled: true }], 'ALO')).toEqual([])
    })

    /**
     * A reserve is `{ key: 'reserve', number: n }` with no day: that `n` is a place in the reserve
     * queue, a numbering of its own, and nothing to do with start numbers. Only a drawn number is
     * one, and a dog waiting on the list has none.
     */
    it('leaves out a reserve, whose number is a place in the queue and not a start number', () => {
      const waiting = dog('avo-1', 'AVO', 3, { group: { key: 'reserve', number: 1 } })

      expect(reservedStartNumbers([waiting], 'ALO')).toEqual([])
    })

    /**
     * The one way a dog off the participant list still holds a start number: it was drawn one, and
     * was moved back to the reserve list afterwards. Nothing releases the number on that move — only
     * cancelling does — so the write still refuses it, and this list has to say the same. Whether
     * the move ought to release it is a question about the write, not about this list.
     */
    it('lists a drawn number left behind by a dog moved back to the reserve list', () => {
      const demoted = { ...drawn('avo-1', 'AVO', 3, 1), group: { key: 'reserve', number: 1 } }

      expect(reservedStartNumbers([demoted], 'ALO')).toEqual([{ eventClass: 'AVO', number: 1 }])
    })
  })

  describe('classStartNumbersResponse', () => {
    it('serves one class: its dogs, its numbers, and the trial they run in', () => {
      const response = classStartNumbersResponse(confirmedEvent, 'ALO', registrations)

      expect(response.eventClass).toBe('ALO')
      expect(response.registrations.map((item) => item.id)).toEqual(['alo-1', 'alo-2'])
      expect(response.event).toMatchObject({ eventType: 'NOWT', location: 'Ranua', name: 'Syyskoe' })
    })

    it('tells the link which numbers are gone, without telling it whose they are', () => {
      const taken = [
        ...registrations,
        dog('avo-3', 'AVO', 5, {
          dog: { name: 'Salainen', regNo: 'REG-9' },
          startGroup: { date: '2026-09-12', key: 'AVO-AP', number: 2, time: 'ap' },
        }),
      ]

      const response = classStartNumbersResponse(confirmedEvent, 'ALO', taken)

      expect(response.reserved).toEqual([{ eventClass: 'AVO', number: 2 }])
      expect(JSON.stringify(response.reserved)).not.toContain('Salainen')
    })

    it('carries the draw sheet as the secretary knows it, and nothing behind it', () => {
      const [first] = classStartNumbersResponse(confirmedEvent, 'ALO', registrations).registrations

      expect(first).toMatchObject({
        dog: { name: 'Koira 1', regNo: 'REG-1' },
        group: { number: 1 },
        handler: { name: 'Ohjaaja 1' },
      })
      // The draw happens with the handlers present, so their names are on the sheet — their contact
      // details are not, and neither is anything else of the registration.
      expect(JSON.stringify(first)).not.toContain('example.com')
    })
  })
})
