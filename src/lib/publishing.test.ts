import type { DayKey, JsonConfirmedEvent } from '../types'
import { freezeClockAt } from '../test-utils/freezeClock'
import { addDays, dayOf, TIME_ZONE } from './day'
import {
  classEntry,
  getResultsBlocker,
  getStartListBlocker,
  getStartNumbersBlocker,
  isResultsPublishedState,
  isStartListFlagPublished,
  isStartListPublished,
} from './publishing'
import { groupParticipantsByClass } from './registration'

const now = new Date()
const inDays = (days: number) => addDays(dayOf(now, TIME_ZONE), days)

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

/** A dog placed on the day, with what the secretary recorded for it. */
const placed = (date: DayKey, eventResult?: { result?: string; retirement?: { cause: 'handlerChoice' } }) => ({
  eventResult,
  group: { date, key: `${date}-ap`, number: 1, time: 'ap' as const },
})
/** A dog with a result recorded on the day. */
const scored = (date: DayKey) => placed(date, { result: 'ALO1' })

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
      expect(
        getStartListBlocker(classless, undefined, [{ ...invited, class: undefined, eventType: 'NOU' }])
      ).toBeUndefined()
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
      // A day already begun, so only the list and the state stand in the way.
      const day = inDays(-1)
      const dogs = [scored(day)]
      expect(getResultsBlocker(event({ state: 'ended' }), 'ALO', dogs, day)).toBe('startList')
      expect(getResultsBlocker(event({ startListPublished: { ALO: true } }), 'ALO', dogs, day)).toBe('state')
      expect(
        getResultsBlocker(event({ startListPublished: { ALO: true }, state: 'ended' }), 'ALO', dogs, day)
      ).toBeUndefined()
    })

    describe('on the first day of a two-day trial (KOE-1510)', () => {
      freezeClockAt('2026-09-12')

      it('refuses a day that has not begun, though the trial is under way', () => {
        const running = event({
          classes: [
            { class: 'ALO', date: '2026-09-12' as const },
            { class: 'ALO', date: '2026-09-13' as const },
          ],
          endDate: '2026-09-13' as const,
          startDate: '2026-09-12' as const,
          startListPublished: { ALO: true },
        })

        const dogs = [scored('2026-09-12'), scored('2026-09-13')]
        expect(getResultsBlocker(running, 'ALO', dogs, '2026-09-12')).toBeUndefined()
        expect(getResultsBlocker(running, 'ALO', dogs, '2026-09-13')).toBe('state')
      })
    })

    describe('after a trial whose class stayed picked (KOE-1509, KOE-1510)', () => {
      freezeClockAt('2026-09-20')

      it('lets each day be published once the list is', () => {
        const picked = event({
          classes: [
            { class: 'ALO', date: '2026-09-12' as const, state: 'picked' },
            { class: 'ALO', date: '2026-09-13' as const, state: 'picked' },
          ],
          endDate: '2026-09-13' as const,
          startDate: '2026-09-12' as const,
          startListPublished: { ALO: true },
          state: 'picked',
        })

        const dogs = [scored('2026-09-13')]
        expect(getResultsBlocker(picked, 'ALO', dogs, '2026-09-13')).toBeUndefined()
        expect(getResultsBlocker({ ...picked, startListPublished: { ALO: false } }, 'ALO', dogs, '2026-09-13')).toBe(
          'startList'
        )
      })
    })

    describe('on a trial whose results have not been entered (KOE-1642)', () => {
      freezeClockAt('2026-09-20')

      const run = event({
        classes: [
          { class: 'ALO', date: '2026-09-12' as const },
          { class: 'ALO', date: '2026-09-13' as const },
        ],
        endDate: '2026-09-13' as const,
        startDate: '2026-09-12' as const,
        startListPublished: { ALO: true },
        state: 'started',
      })

      it('has nothing to publish while no dog of the class has a result on the day', () => {
        expect(getResultsBlocker(run, 'ALO', [placed('2026-09-12'), placed('2026-09-13')], '2026-09-12')).toBe(
          'results'
        )
        expect(getResultsBlocker(run, 'ALO', [], '2026-09-12')).toBe('results')
      })

      it('reads only the day it publishes', () => {
        expect(getResultsBlocker(run, 'ALO', [scored('2026-09-13')], '2026-09-12')).toBe('results')
        expect(getResultsBlocker(run, 'ALO', [scored('2026-09-13')], '2026-09-13')).toBeUndefined()
      })

      it('does not count a participant whose group has no day, as the public list does not show it', () => {
        const undated = { ...scored('2026-09-12'), group: { key: '2026-09-12-ap', number: 1 } }
        expect(getResultsBlocker(run, 'ALO', [undated], '2026-09-12')).toBe('results')
      })

      it('counts a recorded result, not a retirement without one, as there is nothing of it to show', () => {
        const retired = placed('2026-09-12', { retirement: { cause: 'handlerChoice' } })
        expect(getResultsBlocker(run, 'ALO', [retired], '2026-09-12')).toBe('results')
      })
    })
  })

  describe('isResultsPublishedState (KOE-1510)', () => {
    it.each([
      [true, true],
      [false, true],
      [['2026-09-12'], true],
      [['2026-09-11T21:00:00.000Z'], true],
      [{ ALO: true }, true],
      [{ ALO: ['2026-09-12'] }, true],
      [{ ALO: 'x' }, false],
      [{ foo: true }, false],
      [[1], false],
      [null, false],
      [undefined, false],
    ])('reads %j as a results flag: %s', (value, expected) => {
      expect(isResultsPublishedState(value)).toBe(expected)
    })
  })

  describe('a picked class whose trial is over (KOE-1509)', () => {
    freezeClockAt('2026-06-15')

    // A one-day NOME-B with only ALO: the place notices went, the invitations never did.
    const picked = event({
      classes: [{ class: 'ALO', date: '2026-06-13' as const, state: 'picked' }],
      endDate: '2026-06-13' as const,
      entryEndDate: '2026-05-23' as const,
      entryStartDate: '2026-05-02' as const,
      startDate: '2026-06-13' as const,
      startListPublished: { ALO: true },
      state: 'picked',
    })

    it('reads the published list the way the admin let it be published', () => {
      expect(getStartListBlocker(picked, 'ALO', [uninvited])).toBeUndefined()
      expect(isStartListPublished(picked, classEntry(picked, 'ALO'))).toBe(true)
    })

    it('lets its results be published', () => {
      expect(getResultsBlocker(picked, 'ALO', [scored('2026-06-13')], '2026-06-13')).toBeUndefined()
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
