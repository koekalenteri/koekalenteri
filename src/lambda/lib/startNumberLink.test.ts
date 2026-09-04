import type { JsonRegistration, RegistrationClass } from '../../types'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import {
  assertEntriesInClassSpace,
  authorizeStartNumberLink,
  classNumberSpace,
  classStartNumbersResponse,
  deriveStartNumberLinkToken,
  getStartNumberLinkToken,
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

    it('refuses a number that belongs to another class', () => {
      expect(() => assertEntriesInClassSpace(registrations, 'ALO', [{ id: 'alo-1', startNumber: 3 }])).toThrow(
        'startNumberOutsideClass'
      )
    })

    it("refuses another class's dog", () => {
      expect(() => assertEntriesInClassSpace(registrations, 'ALO', [{ id: 'avo-1', startNumber: 1 }])).toThrow(
        'does not run in ALO'
      )
    })
  })

  describe('classStartNumbersResponse', () => {
    it('serves one class: its dogs, its numbers, and the trial they run in', () => {
      const response = classStartNumbersResponse(confirmedEvent, 'ALO', registrations)

      expect(response.eventClass).toBe('ALO')
      expect(response.registrations.map((item) => item.id)).toEqual(['alo-1', 'alo-2'])
      expect(response.event).toMatchObject({ eventType: 'NOWT', location: 'Ranua', name: 'Syyskoe' })
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
