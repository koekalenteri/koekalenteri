import type { JsonConfirmedEvent } from '../types'
import { getResultsBlocker, getStartListBlocker, getStartNumbersBlocker, isStartListFlagPublished } from './publishing'
import { groupParticipantsByClass } from './registration'

const now = new Date()
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)

const event = (overrides: Partial<JsonConfirmedEvent> = {}) =>
  ({
    classes: [{ class: 'ALO', date: inDays(7) }],
    endDate: inDays(7),
    entryEndDate: inDays(-7),
    eventType: 'NOME-B',
    startDate: inDays(7),
    startListPublished: { ALO: false },
    state: 'invited',
    ...overrides,
  }) as JsonConfirmedEvent

const invited = { class: 'ALO', eventType: 'NOME-B', messagesSent: { invitation: true } } as const
const uninvited = { class: 'ALO', eventType: 'NOME-B', messagesSent: {} } as const

describe('lib/publishing', () => {
  describe('getStartListBlocker', () => {
    it('waits on the participants before anything else', () => {
      expect(getStartListBlocker(event({ state: 'confirmed' }), 'ALO', [])).toBe('participants')
    })

    it('waits on the trial reaching its invitations', () => {
      expect(getStartListBlocker(event({ state: 'confirmed' }), 'ALO', [invited])).toBe('state')
    })

    it('waits on an invitation still to go', () => {
      expect(getStartListBlocker(event(), 'ALO', [invited, uninvited])).toBe('invitations')
    })

    it('stops waiting on invitations that can no longer be sent (KOE-1465)', () => {
      const past = event({
        classes: [{ class: 'ALO', date: inDays(-30) }],
        endDate: inDays(-30),
        startDate: inDays(-30),
      })
      expect(getStartListBlocker(past, 'ALO', [uninvited])).toBeUndefined()
    })

    it('lets a start list out once everyone is invited', () => {
      expect(getStartListBlocker(event(), 'ALO', [invited])).toBeUndefined()
    })

    it('answers for a classless event without a class', () => {
      const classless = event({ classes: [], eventType: 'NOU', startListPublished: false })
      expect(getStartListBlocker(classless, undefined, [{ ...invited, class: undefined, eventType: 'NOU' }])).toBe(
        undefined
      )
    })
  })

  describe('isStartListFlagPublished', () => {
    const past = { endDate: inDays(-30), startDate: inDays(-30), startListPublished: undefined }

    it('reads an absent flag as published only where the workflow invited (KOE-1465)', () => {
      expect(isStartListFlagPublished(event({ ...past, state: 'picked' }), 'ALO')).toBe(false)
      expect(isStartListFlagPublished(event({ ...past, classes: [], state: 'picked' }), undefined)).toBe(false)
      expect(isStartListFlagPublished(event({ ...past, state: 'invited' }), 'ALO')).toBe(true)
      expect(isStartListFlagPublished(event({ ...past, classes: [], state: 'invited' }), undefined)).toBe(true)
    })

    it('reads a stored flag as stored, even ahead of the state', () => {
      // A publish ahead of the state is still a publish for the rules to judge.
      expect(isStartListFlagPublished(event({ startListPublished: { ALO: true }, state: 'picked' }), 'ALO')).toBe(true)
      expect(isStartListFlagPublished(event({ startListPublished: { ALO: false } }), 'ALO')).toBe(false)
      expect(
        isStartListFlagPublished(event({ classes: [], startListPublished: true, state: 'picked' }), undefined)
      ).toBe(true)
    })
  })

  describe('getStartNumbersBlocker', () => {
    it('waits on the start list being out', () => {
      expect(getStartNumbersBlocker(event(), 'ALO', [invited])).toBe('startList')
      expect(getStartNumbersBlocker(event({ startListPublished: { ALO: true } }), 'ALO', [invited])).toBeUndefined()
    })

    it('waits on everything the start list does', () => {
      expect(getStartNumbersBlocker(event({ startListPublished: { ALO: true } }), 'ALO', [uninvited])).toBe(
        'invitations'
      )
    })
  })

  describe('getResultsBlocker', () => {
    it('waits on the start list, then on the trial having run', () => {
      expect(getResultsBlocker(event({ state: 'ended' }), 'ALO')).toBe('startList')
      expect(getResultsBlocker(event({ startListPublished: { ALO: true } }), 'ALO')).toBe('state')
      expect(getResultsBlocker(event({ startListPublished: { ALO: true }, state: 'ended' }), 'ALO')).toBeUndefined()
    })
  })

  describe('groupParticipantsByClass', () => {
    it('counts only the dogs picked into a group, a classless one under its event type', () => {
      const picked = { eventType: 'NOU', group: { key: 'day-1', number: 1 } }
      const byClass = groupParticipantsByClass([
        picked,
        { ...picked, group: { key: 'reserve', number: 1 } },
        { ...picked, cancelled: true },
        { eventType: 'NOU' },
      ])

      expect(byClass).toEqual({ NOU: [picked] })
    })
  })
})
