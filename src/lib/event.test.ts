import type { TFunction } from 'i18next'
import type {
  ConfirmedEvent,
  DogEvent,
  EventClass,
  EventClassState,
  EventState,
  JsonDogEvent,
  RegistrationDate,
  RegistrationTime,
} from '../types'
import { TZDate } from '@date-fns/tz'
import { addDays, differenceInDays } from 'date-fns'
import i18n from 'i18next'
import { eventWithEntryClosing, eventWithParticipantsInvited, eventWithStaticDates } from '../__mockData__/events'
import { formatDate, TIME_ZONE, zonedParseDate } from '../i18n/dates'
import { freezeClockAt } from '../test-utils/freezeClock'
import {
  applyNewGroupsToDogEventClass,
  applyNewGroupsToDogEventDates,
  applySingleDayNowtGroups,
  canPublishResults,
  canPublishStartList,
  copyDogEvent,
  defaultEntryEndDate,
  defaultEntryStartDate,
  eventRegistrationDateKey,
  eventTypeLabel,
  foldDayScope,
  getEventClassesByDays,
  getEventDays,
  getEventProgress,
  getEventProgressPhase,
  getEventSavedMessage,
  getEventSeason,
  getEventStateForClass,
  getEventTitle,
  getParticipantsPhase,
  getPublishedStartNumbersDays,
  getPublishedStartNumbersSlots,
  getStartListPublishedClassMap,
  getStartNumbersDayTimes,
  getUniqueEventClasses,
  hasAllResultsPublished,
  hasAvailableResults,
  hasDayStarted,
  hasExplicitPlacesForClass,
  hasMockTrialChoice,
  hasRetrieveTypeChoice,
  hasSharedReserveList,
  isDetaultEntryEndDate,
  isDetaultEntryStartDate,
  isEntryEditingClosed,
  isEventDeletable,
  isEventLive,
  isMockTrialClass,
  isOfficialEventType,
  isResultsAvailableForClass,
  isResultsAvailableForRegistration,
  isResultsPublished,
  isResultsPublishedForDay,
  isSameResultsPublished,
  isStartListAvailable,
  isStartListAvailableForClass,
  isStartListAvailableForRegistration,
  isStartListPublishedForClass,
  isStartNumbersAvailableForClass,
  isStartNumbersAvailableForRegistration,
  isStartNumbersPublishedForClass,
  isStartNumbersPublishedForDay,
  isStartNumbersPublishedForSlot,
  localizedEventDescription,
  localizedEventName,
  newEventEntryEndDate,
  newEventEntryStartDate,
  newEventStartDate,
  placesForClass,
  registrationDatesOutsideClass,
  sanitizeDogEvent,
  startNumbersSlotKey,
  withResultsDay,
} from './event'

describe('lib/event', () => {
  describe('getEventSavedMessage', () => {
    // The real i18next, not the key-echoing stub the other tests use: the bug was in what i18next
    // does with a key it cannot find, and a stub would have proven nothing about it.
    const t = i18n.t.bind(i18n)

    it.each([
      { expected: 'Tapahtuma on tallennettu luonnoksena', state: 'draft' as const },
      { expected: 'Tapahtuma on julkaistu alustavana', state: 'tentative' as const },
      { expected: 'Tapahtuma on julkaistu', state: 'confirmed' as const },
      { expected: 'Tapahtuma on peruttu', state: 'cancelled' as const },
    ])('names what saving a $state event did', ({ expected, state }) => {
      expect(getEventSavedMessage(state, t)).toBe(expected)
    })

    // KOE-1421: these states carry no save message of their own, and asking i18next for one as a
    // context handed back the state's own name — an edit to an invited event that sent nothing
    // announced "Koekutsut lähetetty".
    it.each<EventState>(['picked', 'invited', 'started', 'ended', 'completed'])(
      'reports a plain save for a %s event',
      (state) => {
        expect(getEventSavedMessage(state, t)).toBe('Muutokset tallennettu')
      }
    )

    it('treats an event with no state as a draft', () => {
      expect(getEventSavedMessage(undefined, t)).toBe('Tapahtuma on tallennettu luonnoksena')
    })
  })

  describe('getEventTitle', () => {
    const t = ((key: string) => key) as TFunction<'translation'>
    const now = new Date()
    const event = (overrides: Partial<DogEvent>): DogEvent => ({ ...eventWithEntryClosing, ...overrides })

    it('returns the current progress phase directly', () => {
      const confirmedEvent: ConfirmedEvent = {
        ...eventWithEntryClosing,
        endDate: addDays(now, 3),
        entryEndDate: addDays(now, -1),
        entryStartDate: addDays(now, -3),
        startDate: addDays(now, 2),
        state: 'picked',
      }

      expect(getEventProgressPhase(confirmedEvent, now)).toBe('picked')
    })

    it.each([
      {
        expected: 'event.states.ended',
        overrides: { endDate: addDays(now, -1), state: 'confirmed' as const },
      },
      {
        expected: 'event.states.confirmed_entryOpen',
        overrides: {
          endDate: addDays(now, 3),
          entryEndDate: addDays(now, 1),
          entryStartDate: addDays(now, -1),
          startDate: addDays(now, 2),
          state: 'confirmed' as const,
        },
      },
      {
        expected: 'event.states.confirmed_entryClosed',
        overrides: {
          endDate: addDays(now, 3),
          entryEndDate: addDays(now, -1),
          entryStartDate: addDays(now, -3),
          startDate: addDays(now, 2),
          state: 'confirmed' as const,
        },
      },
      {
        expected: 'event.states.started',
        overrides: {
          endDate: addDays(now, 1),
          entryEndDate: addDays(now, -2),
          entryStartDate: addDays(now, -3),
          startDate: addDays(now, -1),
          state: 'started' as const,
        },
      },
    ])('returns $expected for the matching event phase', ({ expected, overrides }) => {
      expect(getEventTitle(event(overrides), t, now)).toBe(expected)
    })

    it.each<EventState>(['draft', 'confirmed'])('falls back to the %s state title', (state) => {
      expect(
        getEventTitle(
          event({
            endDate: addDays(now, 3),
            entryEndDate: addDays(now, 2),
            entryStartDate: addDays(now, 1),
            startDate: addDays(now, 2),
            state,
          }),
          t,
          now
        )
      ).toBe(`event.states.${state}`)
    })

    it('uses the least advanced class phase', () => {
      expect(
        getEventTitle(
          event({
            classes: [
              { class: 'ALO', date: addDays(now, 2), state: 'picked' },
              { class: 'AVO', date: addDays(now, 2), state: 'invited' },
            ],
            endDate: addDays(now, 3),
            entryEndDate: addDays(now, -1),
            entryStartDate: addDays(now, -3),
            startDate: addDays(now, 2),
            state: 'confirmed',
          }),
          t,
          now
        )
      ).toBe('event.states.picked')
    })

    it.each([
      {
        expected: 'event.states.startListPublished',
        startListPublished: { ALO: true, AVO: true },
        startNumbersPublished: false,
      },
      {
        expected: 'event.states.picked',
        startListPublished: { ALO: true, AVO: false },
        startNumbersPublished: false,
      },
      // An absent numbers flag means published (legacy events), advancing the phase past the list.
      {
        expected: 'event.states.startNumbersPublished',
        startListPublished: { ALO: true, AVO: true },
        startNumbersPublished: undefined,
      },
      {
        expected: 'event.states.startNumbersPublished',
        startListPublished: { ALO: true, AVO: true },
        startNumbersPublished: { ALO: true, AVO: true },
      },
      // Withheld numbers in one class keep the event at the start list phase.
      {
        expected: 'event.states.startListPublished',
        startListPublished: { ALO: true, AVO: true },
        startNumbersPublished: { ALO: true, AVO: false },
      },
    ])(
      'returns $expected based on class start list and number publishing',
      ({ expected, startListPublished, startNumbersPublished }) => {
        expect(
          getEventTitle(
            event({
              classes: [
                { class: 'ALO', date: addDays(now, 2), state: 'picked' },
                { class: 'AVO', date: addDays(now, 2), state: 'invited' },
              ],
              endDate: addDays(now, 3),
              entryEndDate: addDays(now, -1),
              entryStartDate: addDays(now, -3),
              startDate: addDays(now, 2),
              startListPublished,
              startNumbersPublished,
              state: 'invited',
            }),
            t,
            now
          )
        ).toBe(expected)
      }
    )

    it('shows a published start list phase for an event without classes', () => {
      expect(
        getEventTitle(
          event({
            classes: [],
            endDate: addDays(now, 3),
            entryEndDate: addDays(now, -1),
            entryStartDate: addDays(now, -3),
            startDate: addDays(now, 2),
            startListPublished: true,
            startNumbersPublished: false,
            state: 'invited',
          }),
          t,
          now
        )
      ).toBe('event.states.startListPublished')
    })

    it('shows a published start numbers phase for an event without classes', () => {
      expect(
        getEventTitle(
          event({
            classes: [],
            endDate: addDays(now, 3),
            entryEndDate: addDays(now, -1),
            entryStartDate: addDays(now, -3),
            startDate: addDays(now, 2),
            startListPublished: true,
            startNumbersPublished: true,
            state: 'invited',
          }),
          t,
          now
        )
      ).toBe('event.states.startNumbersPublished')
    })
  })

  describe('getEventStateForClass', () => {
    it('uses the class state when it is set', () => {
      expect(
        getEventStateForClass(
          {
            classes: [
              { class: 'ALO', state: 'invited' },
              { class: 'AVO', state: 'picked' },
            ],
            state: 'confirmed',
          },
          'ALO'
        )
      ).toBe('invited')
    })

    it('falls back to the event state', () => {
      expect(getEventStateForClass({ classes: [{ class: 'ALO' }], state: 'confirmed' }, 'ALO')).toBe('confirmed')
      expect(getEventStateForClass({ classes: [], state: 'invited' }, 'ALO')).toBe('invited')
    })
  })

  describe('isStartListPublished', () => {
    // No dates, so only the workflow state and the flags decide; the date path has its own tests.
    const noDates = { endDate: undefined, startDate: undefined }

    it.each<EventState>(['invited', 'started', 'ended', 'completed'])(
      'Should return true when state is %p and startListPublished is undefined or true',
      (state) => {
        expect(isStartListAvailable({ ...noDates, state })).toEqual(true)
        expect(isStartListAvailable({ ...noDates, startListPublished: true, state })).toEqual(true)
      }
    )

    it.each<EventState>(['invited', 'started', 'ended', 'completed'])(
      'Should return false when state is %p and startListPublished is false',
      (state) => {
        expect(isStartListAvailable({ ...noDates, startListPublished: false, state })).toEqual(false)
      }
    )

    it('returns true when at least one class start list is published', () => {
      expect(
        isStartListAvailable({
          ...noDates,
          startListPublished: { ALO: false, AVO: true },
          state: 'invited',
        })
      ).toEqual(true)
    })

    it('returns true when an invited class start list is published even if the event is only confirmed', () => {
      expect(
        isStartListAvailable({
          ...noDates,
          classes: [
            { class: 'ALO', state: 'picked' },
            { class: 'AVO', state: 'invited' },
          ],
          startListPublished: { ALO: true, AVO: true },
          state: 'confirmed',
        })
      ).toEqual(true)
    })

    it('returns false when the only published class is not yet invited', () => {
      expect(
        isStartListAvailable({
          ...noDates,
          classes: [
            { class: 'ALO', state: 'picked' },
            { class: 'AVO', state: 'picked' },
          ],
          startListPublished: { ALO: true, AVO: false },
          state: 'confirmed',
        })
      ).toEqual(false)
    })

    it('returns false when class-specific publishing is configured but no class is published', () => {
      expect(
        isStartListAvailable({
          ...noDates,
          startListPublished: { ALO: false, AVO: false },
          state: 'invited',
        })
      ).toEqual(false)
    })

    it('returns false for a sparse class-specific map when omitted classes are unpublished', () => {
      expect(
        isStartListAvailable({
          ...noDates,
          classes: [{ class: 'ALO' }, { class: 'AVO' }],
          startListPublished: { ALO: false },
          state: 'invited',
        })
      ).toEqual(false)
    })

    it.each<EventState>(['draft', 'tentative', 'cancelled', 'confirmed', 'picked'])(
      'Should return false when state is %p',
      (state) => {
        expect(isStartListAvailable({ ...noDates, state })).toEqual(false)
      }
    )

    it('start numbers ride the list but publish separately', () => {
      const published = { startListPublished: { ALO: true, AVO: true }, state: 'invited' as const }

      // An absent flag means published: every event before the flag put its numbers out with the
      // list, and a deploy must not pull them.
      expect(isStartNumbersAvailableForClass(published, { class: 'ALO' })).toBe(true)

      // Only an explicit false withholds — for the whole event or for the class's own entry.
      expect(isStartNumbersAvailableForClass({ ...published, startNumbersPublished: false }, { class: 'ALO' })).toBe(
        false
      )
      expect(
        isStartNumbersAvailableForClass({ ...published, startNumbersPublished: { ALO: false } }, { class: 'ALO' })
      ).toBe(false)
      // A class missing from an existing map was added after the flag existed: it has no legacy
      // claim, so it stays unpublished until explicitly released (KOE-1266).
      expect(
        isStartNumbersAvailableForClass({ ...published, startNumbersPublished: { ALO: false } }, { class: 'AVO' })
      ).toBe(false)
      expect(
        isStartNumbersAvailableForClass({ ...published, startNumbersPublished: { AVO: true } }, { class: 'AVO' })
      ).toBe(true)

      // Numbers cannot be public on an unpublished list: the list is their only transport.
      expect(
        isStartNumbersAvailableForClass(
          { startListPublished: { ALO: false }, startNumbersPublished: true, state: 'invited' },
          { class: 'ALO' }
        )
      ).toBe(false)
    })

    it('publishes a multi-day class one day at a time (KOE-1304)', () => {
      const event = {
        classes: [
          { class: 'ALO' as const, date: '2026-09-04' },
          { class: 'ALO' as const, date: '2026-09-05' },
        ],
        endDate: '2026-09-05',
        startDate: '2026-09-04',
        startListPublished: { ALO: true },
        startNumbersPublished: { ALO: ['2026-09-04'] },
        state: 'invited' as const,
      }

      // Friday's numbers are out, Saturday's are not — per class entry and per registration alike.
      expect(isStartNumbersAvailableForClass(event, event.classes[0])).toBe(true)
      expect(isStartNumbersAvailableForClass(event, event.classes[1])).toBe(false)
      expect(isStartNumbersAvailableForRegistration(event, { class: 'ALO', group: { date: '2026-09-04' } })).toBe(true)
      expect(isStartNumbersAvailableForRegistration(event, { class: 'ALO', group: { date: '2026-09-05' } })).toBe(false)

      // The class counts as published only once every day it runs is out.
      expect(isStartNumbersPublishedForClass(event, 'ALO')).toBe(false)
      expect(getPublishedStartNumbersDays(event, 'ALO')).toEqual(['2026-09-04'])
      expect(
        isStartNumbersPublishedForClass(
          { ...event, startNumbersPublished: { ALO: ['2026-09-04', '2026-09-05'] } },
          'ALO'
        )
      ).toBe(true)
      expect(getPublishedStartNumbersDays({ ...event, startNumbersPublished: { ALO: true } }, 'ALO')).toEqual([
        '2026-09-04',
        '2026-09-05',
      ])

      // The browser's JSON reviver turns the stored "2026-09-04" into a date; the answer must not change.
      const revived = { ...event, startNumbersPublished: { ALO: [new Date(2026, 8, 4, 12)] } }
      expect(isStartNumbersAvailableForClass(revived, event.classes[0])).toBe(true)
      expect(isStartNumbersAvailableForClass(revived, event.classes[1])).toBe(false)
      expect(getPublishedStartNumbersDays(revived, 'ALO')).toEqual(['2026-09-04'])

      // A classless event keys its days off its own dates.
      const classless = { ...event, classes: [], startNumbersPublished: ['2026-09-05'] }
      expect(isStartNumbersAvailableForRegistration(classless, { group: { date: '2026-09-05' } })).toBe(true)
      expect(isStartNumbersAvailableForRegistration(classless, { group: { date: '2026-09-04' } })).toBe(false)
      expect(isStartNumbersPublishedForClass(classless)).toBe(false)
      expect(
        isStartNumbersPublishedForClass({ ...classless, startNumbersPublished: ['2026-09-04', '2026-09-05'] })
      ).toBe(true)
    })

    it('publishes a day by halves, the morning before the afternoon (KOE-1430)', () => {
      const event = {
        classes: [
          { class: 'ALO' as const, date: '2026-09-26' },
          { class: 'AVO' as const, date: '2026-09-26' },
        ],
        endDate: '2026-09-26',
        startDate: '2026-09-26',
        startListPublished: { ALO: true, AVO: true },
        startNumbersPublished: { ALO: ['2026-09-26/ap'], AVO: false },
        state: 'invited' as const,
      }
      const morning = { class: 'ALO', group: { date: '2026-09-26', time: 'ap' as const } }
      const afternoon = { class: 'ALO', group: { date: '2026-09-26', time: 'ip' as const } }

      // The morning's numbers are out and the afternoon's are not; a dog with no half only has the day.
      expect(isStartNumbersAvailableForRegistration(event, morning)).toBe(true)
      expect(isStartNumbersAvailableForRegistration(event, afternoon)).toBe(false)
      expect(isStartNumbersAvailableForRegistration(event, { class: 'ALO', group: { date: '2026-09-26' } })).toBe(false)
      expect(isStartNumbersPublishedForSlot(event, 'ALO', '2026-09-26', 'ap')).toBe(true)
      expect(isStartNumbersPublishedForSlot(event, 'ALO', '2026-09-26', 'ip')).toBe(false)
      expect(isStartNumbersPublishedForSlot(event, 'ALO', '2026-09-26', 'kp')).toBe(false)

      // Half a day does not make the day, the class, or the class entry published.
      expect(isStartNumbersPublishedForDay(event, 'ALO', '2026-09-26')).toBe(false)
      expect(isStartNumbersPublishedForClass(event, 'ALO')).toBe(false)
      expect(isStartNumbersAvailableForClass(event, event.classes[0])).toBe(false)
      expect(getPublishedStartNumbersDays(event, 'ALO')).toEqual([])
      // But the caption knows which half is out.
      expect(getPublishedStartNumbersSlots(event, 'ALO')).toEqual([{ date: '2026-09-26', time: 'ap' }])
      expect(getPublishedStartNumbersSlots({ ...event, startNumbersPublished: { ALO: true } }, 'ALO')).toEqual([
        { date: '2026-09-26' },
      ])

      // A whole day covers both halves, whichever form it came in.
      const wholeDay = { ...event, startNumbersPublished: { ALO: ['2026-09-26'] } }
      expect(isStartNumbersAvailableForRegistration(wholeDay, afternoon)).toBe(true)
      const revived = { ...event, startNumbersPublished: { ALO: [new Date(2026, 8, 26, 12)] } }
      expect(isStartNumbersAvailableForRegistration(revived, afternoon)).toBe(true)
      expect(isStartNumbersPublishedForSlot(revived, 'ALO', new Date(2026, 8, 26, 9), 'ap')).toBe(true)

      // The halves a day runs in come from the dogs placed on it, and only a split day has any.
      expect(getStartNumbersDayTimes([morning, afternoon], '2026-09-26')).toEqual(['ap', 'ip'])
      expect(getStartNumbersDayTimes([morning, morning], '2026-09-26')).toEqual([])
      expect(getStartNumbersDayTimes([morning, afternoon], '2026-09-27')).toEqual([])
      expect(getStartNumbersDayTimes([{ group: { date: '2026-09-26', time: 'kp' } }, afternoon], '2026-09-26')).toEqual(
        []
      )
      expect(startNumbersSlotKey('2026-09-26', 'ip')).toBe('2026-09-26/ip')
      expect(startNumbersSlotKey('2026-09-26', 'kp')).toBe('2026-09-26')
    })

    it('answers per registration through the class that runs its day', () => {
      const event = {
        classes: [{ class: 'ALO' as const, date: '2025-01-01' }],
        startDate: '2025-01-01',
        startListPublished: { ALO: true },
        startNumbersPublished: { ALO: false },
        state: 'invited' as const,
      }
      const registration = { class: 'ALO', group: { date: '2025-01-01' } }

      expect(isStartListAvailableForRegistration(event, registration)).toBe(true)
      expect(isStartNumbersAvailableForRegistration(event, registration)).toBe(false)
      expect(isStartNumbersAvailableForRegistration({ ...event, startNumbersPublished: undefined }, registration)).toBe(
        true
      )
    })

    it('checks class state and publication together', () => {
      expect(
        isStartListAvailableForClass(
          { startListPublished: { ALO: true, AVO: true }, state: 'confirmed' },
          { class: 'ALO', state: 'invited' }
        )
      ).toEqual(true)
      expect(
        isStartListAvailableForClass(
          { startListPublished: { ALO: true, AVO: true }, state: 'confirmed' },
          { class: 'AVO', state: 'picked' }
        )
      ).toEqual(false)
    })

    it('uses the matching event class date for registration availability', () => {
      const event = {
        classes: [
          { class: 'AVO' as const, date: '2025-01-01', state: 'started' as const },
          { class: 'AVO' as const, date: '2025-01-02', state: 'picked' as const },
        ],
        startDate: '2025-01-01',
        startListPublished: { AVO: true },
        state: 'confirmed' as const,
      }

      expect(isStartListAvailableForRegistration(event, { class: 'AVO', group: { date: '2025-01-01' } })).toBe(true)
      expect(isStartListAvailableForRegistration(event, { class: 'AVO', group: { date: '2025-01-02' } })).toBe(false)
    })

    it('normalizes ISO timestamps to the same event calendar day', () => {
      const event = {
        classes: [
          { class: 'AVO' as const, date: '2025-01-01T22:30:00.000Z', state: 'started' as const },
          { class: 'AVO' as const, date: '2025-01-03T10:00:00.000Z', state: 'picked' as const },
        ],
        startDate: '2025-01-01T22:30:00.000Z',
        startListPublished: { AVO: true },
        state: 'confirmed' as const,
      }

      expect(
        isStartListAvailableForRegistration(event, { class: 'AVO', group: { date: '2025-01-02T12:00:00.000Z' } })
      ).toBe(true)
    })

    it('uses the only matching class when a registration date differs', () => {
      const event = {
        classes: [{ class: 'AVO' as const, date: '2025-01-01', state: 'started' as const }],
        startDate: '2025-01-01',
        startListPublished: { AVO: true },
        state: 'confirmed' as const,
      }

      expect(isStartListAvailableForRegistration(event, { class: 'AVO', group: { date: '2025-01-02' } })).toBe(true)
    })

    it('handles legacy events without classes', () => {
      expect(
        isStartListAvailableForRegistration(
          { classes: undefined, startDate: '2025-01-01', startListPublished: true, state: 'invited' },
          { class: 'AVO', group: { date: '2025-01-01' } }
        )
      ).toBe(true)
    })

    it('does not expose a classless registration for an event with classes', () => {
      expect(
        isStartListAvailableForRegistration(
          {
            classes: [{ class: 'AVO', date: '2025-01-01', state: 'started' }],
            startDate: '2025-01-01',
            startListPublished: { AVO: true },
            state: 'confirmed',
          },
          { group: { date: '2025-01-01' } }
        )
      ).toBe(false)
    })

    it('fails closed when a registration date cannot be matched to an ambiguous class', () => {
      const event = {
        classes: [
          { class: 'AVO' as const, date: '2025-01-01', state: 'started' as const },
          { class: 'AVO' as const, date: '2025-01-02', state: 'picked' as const },
        ],
        startDate: '2025-01-01',
        startListPublished: { AVO: true },
        state: 'confirmed' as const,
      }

      expect(isStartListAvailableForRegistration(event, { class: 'AVO', group: { date: '2025-01-03' } })).toBe(false)
    })

    it('uses the event-level value when class-specific publishing is not configured', () => {
      expect(isStartListPublishedForClass({}, 'ALO')).toEqual(true)
      expect(isStartListPublishedForClass({ startListPublished: true }, 'ALO')).toEqual(true)
      expect(isStartListPublishedForClass({ startListPublished: false }, 'ALO')).toEqual(false)
    })

    it('uses class-specific publishing when configured', () => {
      expect(
        isStartListPublishedForClass(
          {
            startListPublished: { ALO: true, AVO: false },
          },
          'ALO'
        )
      ).toEqual(true)
      expect(
        isStartListPublishedForClass(
          {
            startListPublished: { ALO: false, AVO: true },
          },
          'ALO'
        )
      ).toEqual(false)
    })

    it('treats classes omitted from a class-specific map as unpublished', () => {
      expect(
        isStartListPublishedForClass(
          {
            startListPublished: { ALO: false },
          },
          'AVO'
        )
      ).toEqual(false)
      expect(
        isStartListPublishedForClass(
          {
            startListPublished: { ALO: true },
          },
          'AVO'
        )
      ).toEqual(false)
    })

    it('builds a full class map with missing classes unpublished', () => {
      expect(
        getStartListPublishedClassMap({
          classes: [{ class: 'ALO' }, { class: 'AVO' }],
          startListPublished: { ALO: true },
          state: 'invited',
        })
      ).toEqual({ ALO: true, AVO: false })
    })

    it('builds a full class map from legacy event-level publishing values', () => {
      expect(
        getStartListPublishedClassMap({
          classes: [{ class: 'ALO' }, { class: 'AVO' }],
          startListPublished: true,
          state: 'picked',
        })
      ).toEqual({ ALO: true, AVO: true })
      expect(
        getStartListPublishedClassMap({
          classes: [{ class: 'ALO' }, { class: 'AVO' }],
          startListPublished: false,
          state: 'invited',
        })
      ).toEqual({ ALO: false, AVO: false })
    })

    describe('an event-wide true over a picked class (KOE-1509)', () => {
      freezeClockAt('2026-06-15')

      // An event-wide true never opens a class kept at 'picked', but a map entry does once the trial
      // is over: expanding the flag when another class is toggled must not publish AVO by itself.
      const event = {
        classes: [
          { class: 'ALO' as const, date: '2026-06-13', state: 'invited' as const },
          { class: 'AVO' as const, date: '2026-06-13', state: 'picked' as const },
        ],
        endDate: '2026-06-13',
        startDate: '2026-06-13',
        startListPublished: true,
        state: 'picked' as const,
      }

      it('expands the picked class as unpublished', () => {
        expect(getStartListPublishedClassMap(event)).toEqual({ ALO: true, AVO: false })
      })

      it('leaves every class reading as it did before the expansion', () => {
        const expanded = { ...event, startListPublished: getStartListPublishedClassMap(event) }
        for (const eventClass of event.classes) {
          expect(isStartListAvailableForClass(expanded, eventClass)).toBe(
            isStartListAvailableForClass(event, eventClass)
          )
        }
      })

      it('keeps a class published where another of its days is past the picking', () => {
        const twoDays = {
          ...event,
          classes: [
            { class: 'ALO' as const, date: '2026-06-13', state: 'picked' as const },
            { class: 'ALO' as const, date: '2026-06-14', state: 'invited' as const },
          ],
          endDate: '2026-06-14',
        }
        expect(getStartListPublishedClassMap(twoDays)).toEqual({ ALO: true })
      })

      it('keeps a class published whatever the order of its days', () => {
        // A later picked day must not overwrite the invited one: toggling another class would
        // silently unpublish ALO's invited day.
        const twoDays = {
          ...event,
          classes: [
            { class: 'ALO' as const, date: '2026-06-13', state: 'invited' as const },
            { class: 'ALO' as const, date: '2026-06-14', state: 'picked' as const },
          ],
          endDate: '2026-06-14',
        }
        expect(getStartListPublishedClassMap(twoDays)).toEqual({ ALO: true })
      })
    })

    it('expands an absent flag only for the classes the workflow carried to invited', () => {
      // Read as the public list reads it: a past trial whose invitations were never sent has nothing
      // published, so publishing one class must not publish the others with it (KOE-1465).
      const lastYear = addDays(new Date(), -365)
      expect(
        getStartListPublishedClassMap({
          classes: [{ class: 'ALO', state: 'invited' }, { class: 'AVO' }, { class: 'VOI', state: 'picked' }],
          endDate: lastYear,
          startDate: lastYear,
          state: 'picked',
        })
      ).toEqual({ ALO: true, AVO: false, VOI: false })
      expect(
        getStartListPublishedClassMap({
          classes: [{ class: 'ALO' }, { class: 'AVO' }],
          state: 'invited',
        })
      ).toEqual({ ALO: true, AVO: true })
    })
  })

  describe('isEventDeletable', () => {
    it.each<EventState>(['draft', 'tentative', 'cancelled'])('Should return true when event state is %p', (state) => {
      expect(isEventDeletable({ state })).toEqual(true)
    })
    it.each<EventState>(['completed', 'confirmed', 'ended', 'invited', 'picked', 'started'])(
      'Should return false when event state is %p',
      (state) => {
        expect(isEventDeletable({ state })).toEqual(false)
      }
    )
    it('should return false when event is undefined', () => {
      expect(isEventDeletable()).toEqual(false)
    })
  })

  describe('getEventSeason', () => {
    it('returns the year in Finnish timezone', () => {
      expect(getEventSeason('2024-12-31T22:00:00.000Z')).toEqual('2025')
    })

    it('returns an empty string when start date is missing or invalid', () => {
      expect(getEventSeason()).toEqual('')
      expect(getEventSeason('')).toEqual('')
    })
  })

  describe('eventDays', () => {
    it.each`
      startDate                | endDate                  | expected
      ${new Date(2023, 0, 1)}  | ${new Date(2023, 0, 1)}  | ${[new TZDate(2023, 0, 1, TIME_ZONE)]}
      ${new Date(2023, 1, 15)} | ${new Date(2023, 1, 16)} | ${[new TZDate(2023, 1, 15, TIME_ZONE), new TZDate(2023, 1, 16, TIME_ZONE)]}
      ${new Date(2023, 2, 10)} | ${new Date(2023, 2, 12)} | ${[new TZDate(2023, 2, 10, TIME_ZONE), new TZDate(2023, 2, 11, TIME_ZONE), new TZDate(2023, 2, 12, TIME_ZONE)]}
    `('returns $expected when event startDate=$startDate and endDate=$endDate', ({ startDate, endDate, expected }) => {
      expect(getEventDays({ endDate, startDate })).toEqual(expected)
    })
  })

  describe('getUniqueEventClasses', () => {
    it.each`
      classes                                                                     | expected
      ${[]}                                                                       | ${[]}
      ${[null, undefined, NaN, {}]}                                               | ${[]}
      ${[{ class: 'ALO' }]}                                                       | ${['ALO']}
      ${[{ class: 'ALO' }, { class: 'ALO' }]}                                     | ${['ALO']}
      ${[{ class: 'ALO' }, { class: 'AVO' }]}                                     | ${['ALO', 'AVO']}
      ${[{ class: 'ALO' }, { class: 'AVO' }, { class: 'AVO' }, { class: 'VOI' }]} | ${['ALO', 'AVO', 'VOI']}
    `('returns $expected for test array #$# ($classes.length items)', ({ classes, expected }) => {
      expect(getUniqueEventClasses({ classes })).toEqual(expected)
    })

    it('should return empty array when there are no classes', () => {
      // Legacy data can lack classes even though the type requires them
      expect(getUniqueEventClasses({} as Pick<DogEvent, 'classes'>)).toEqual([])
    })
  })

  describe('getEventClassesByDays', () => {
    describe('for single day event', () => {
      const date = new TZDate(2023, 11, 24, TIME_ZONE)

      it.each`
        classes                     | expected
        ${[]}                       | ${[{ classes: [], day: date }]}
        ${[{ class: 'ALO' }]}       | ${[{ classes: [{ class: 'ALO' }], day: date }]}
        ${[{ class: 'ALO', date }]} | ${[{ classes: [{ class: 'ALO', date }], day: date }]}
      `(
        'returns day: $expected.0.day, classes.length: $expected.0.classes.length for test $#',
        ({
          classes,
          expected,
        }: {
          classes: DogEvent['classes']
          expected: ReturnType<typeof getEventClassesByDays>
        }) => {
          expect(getEventClassesByDays({ classes, endDate: date, startDate: date })).toEqual(expected)
        }
      )
    })

    describe('for two day event', () => {
      const startDate = new TZDate(2023, 11, 23, TIME_ZONE)
      const endDate = new TZDate(2023, 11, 24, TIME_ZONE)

      it.each`
        classes                                                                 | expected
        ${[]}                                                                   | ${[{ classes: [], day: startDate }, { classes: [], day: endDate }]}
        ${[{ class: 'ALO' }]}                                                   | ${[{ classes: [{ class: 'ALO' }], day: startDate }, { classes: [], day: endDate }]}
        ${[{ class: 'ALO', date: startDate }]}                                  | ${[{ classes: [{ class: 'ALO', date: startDate }], day: startDate }, { classes: [], day: endDate }]}
        ${[{ class: 'ALO', date: startDate }, { class: 'ALO', date: endDate }]} | ${[{ classes: [{ class: 'ALO', date: startDate }], day: startDate }, { classes: [{ class: 'ALO', date: endDate }], day: endDate }]}
        ${[{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }]} | ${[{ classes: [], day: startDate }, { classes: [{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }], day: endDate }]}
        ${[{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }, { class: 'VOI', date: startDate }]} | ${[{ classes: [{ class: 'VOI', date: startDate }], day: startDate }, { classes: [{ class: 'ALO', date: endDate }, { class: 'AVO', date: endDate }], day: endDate }]}
      `(
        'returns day: $expected.0.day, classes.length: $expected.0.classes.length, day: $expected.1.day, classes.length: $expected.1.classes.length for test $#',
        ({
          classes,
          expected,
        }: {
          classes: DogEvent['classes']
          expected: ReturnType<typeof getEventClassesByDays>
        }) => {
          expect(getEventClassesByDays({ classes, endDate, startDate })).toEqual(expected)
        }
      )
    })

    it('should return empty empty array as classes when classes is missing', () => {
      const date = new TZDate(2025, 2, 27, TIME_ZONE)
      // Legacy data can lack classes even though the type requires them
      expect(
        getEventClassesByDays({ endDate: date, startDate: date } as unknown as Pick<
          DogEvent,
          'startDate' | 'endDate' | 'classes'
        >)
      ).toEqual([{ classes: [], day: date }])
    })
  })

  describe('applySingleDayNowtGroups', () => {
    const date = new TZDate(2024, 3, 1, TIME_ZONE)
    const date2 = new TZDate(2024, 3, 2, TIME_ZONE)
    const classes: EventClass[] = [
      { class: 'ALO', date },
      { class: 'AVO', date },
    ]

    it('selects kp for every class in a single-day NOWT event', () => {
      expect(applySingleDayNowtGroups('NOWT', date, date, classes)).toEqual([
        { class: 'ALO', date, groups: ['kp'] },
        { class: 'AVO', date, groups: ['kp'] },
      ])
    })

    it.each([
      ['NOWT', date2],
      ['NOME-B', date],
    ])('does not change groups for %s ending on a different or non-NOWT date', (eventType, endDate) => {
      expect(applySingleDayNowtGroups(eventType, date, endDate, classes)).toEqual(classes)
    })
  })

  describe('applyNewGroupsToDogEventClass and applyNewGroupsToDogEventDates', () => {
    const date = new TZDate(2024, 3, 1, TIME_ZONE)
    const date2 = new TZDate(2024, 3, 2, TIME_ZONE)
    const defaultGroups: RegistrationTime[] = ['ap', 'ip']

    it.each`
      classes                                                     | eventClass | defaultGroups   | newDates                                        | expected
      ${[]}                                                       | ${'ALO'}   | ${[]}           | ${[]}                                           | ${{ classes: [], dates: undefined }}
      ${[{ class: 'ALO', date }]}                                 | ${'ALO'}   | ${['ap', 'ip']} | ${[{ date, time: 'kp' }]}                       | ${{ classes: [{ class: 'ALO', date, groups: ['kp'] }], dates: undefined }}
      ${[{ class: 'ALO', date }]}                                 | ${'ALO'}   | ${['ap', 'ip']} | ${[{ date, time: 'ap' }, { date, time: 'kp' }]} | ${{ classes: [{ class: 'ALO', date, groups: ['kp'] }], dates: undefined }}
      ${[{ class: 'ALO', date, groups: [{ date, time: 'kp' }] }]} | ${'ALO'}   | ${['ap', 'ip']} | ${[{ date, time: 'ap' }]}                       | ${{ classes: [{ class: 'ALO', date, groups: ['ap'] }], dates: undefined }}
    `(
      'returns $expected.classes when classes are $classes, eventClass is $eventClass, defaultGroups are $defaultGroups, newDates are $devDates',
      ({ classes, eventClass, defaultGroups, newDates, expected }) => {
        expect(applyNewGroupsToDogEventClass({ classes }, eventClass, defaultGroups, newDates)).toEqual(expected)
      }
    )

    describe('applyNewGroupsToDogEventClass', () => {
      it('should apply defaults to other classes without groups', () => {
        const classes: EventClass[] = [
          { class: 'ALO', date },
          { class: 'AVO', date, groups: ['ip'] },
          { class: 'VOI', date, groups: ['kp'] },
          { class: 'VOI', date: date2, groups: [] },
        ]
        expect(
          applyNewGroupsToDogEventClass({ classes }, 'VOI', defaultGroups, [{ date, time: 'ap' }, { date: date2 }])
        ).toEqual({
          classes: [
            { class: 'ALO', date, groups: defaultGroups },
            { class: 'AVO', date, groups: ['ip'] },
            { class: 'VOI', date, groups: ['ap'] },
            { class: 'VOI', date: date2, groups: [...defaultGroups] },
          ],
          dates: undefined,
        })
      })
    })

    describe('single class', () => {
      const eventClass = 'ALO'

      it.each`
        existing         | selected              | expected
        ${[]}            | ${[]}                 | ${defaultGroups}
        ${[]}            | ${['ap']}             | ${['ap']}
        ${[]}            | ${['ap', 'ip']}       | ${['ap', 'ip']}
        ${[]}            | ${['ip']}             | ${['ip']}
        ${[]}            | ${['ip', 'kp']}       | ${['kp']}
        ${[]}            | ${['kp']}             | ${['kp']}
        ${[]}            | ${['ap', 'kp']}       | ${['kp']}
        ${[]}            | ${['ap', 'ip', 'kp']} | ${['kp']}
        ${['kp']}        | ${[]}                 | ${defaultGroups}
        ${['kp']}        | ${['ap']}             | ${['ap']}
        ${['kp']}        | ${['ap', 'ip']}       | ${['ap', 'ip']}
        ${['kp']}        | ${['ip']}             | ${['ip']}
        ${['kp']}        | ${['ip', 'kp']}       | ${['ip']}
        ${['kp']}        | ${['kp']}             | ${['kp']}
        ${['kp']}        | ${['ap', 'kp']}       | ${['ap']}
        ${['kp']}        | ${['ap', 'ip', 'kp']} | ${['ap', 'ip']}
        ${defaultGroups} | ${[]}                 | ${['kp']}
        ${defaultGroups} | ${['ap']}             | ${['ap']}
        ${defaultGroups} | ${['ap', 'ip']}       | ${['ap', 'ip']}
        ${defaultGroups} | ${['ip']}             | ${['ip']}
        ${defaultGroups} | ${['ip', 'kp']}       | ${['kp']}
        ${defaultGroups} | ${['kp']}             | ${['kp']}
        ${defaultGroups} | ${['ap', 'kp']}       | ${['kp']}
        ${defaultGroups} | ${['ap', 'ip', 'kp']} | ${['kp']}
      `(
        'it should return groups: $expected when existing=$existing, selected=$selected',
        ({ existing, selected, expected }) => {
          const classes: EventClass[] = [{ class: eventClass, date, groups: existing }]
          const dates: RegistrationDate[] = existing.map((time: RegistrationTime) => ({ date, time }))
          const newDates: RegistrationDate[] = selected.map((time: RegistrationTime) => ({ date, time }))

          expect(applyNewGroupsToDogEventClass({ classes }, eventClass, defaultGroups, newDates)).toEqual({
            classes: [{ class: eventClass, date, groups: expected }],
            dates: undefined,
          })

          expect(
            applyNewGroupsToDogEventDates({ dates, endDate: date, startDate: date }, defaultGroups, newDates)
          ).toEqual({
            classes: [],
            dates: expected.map((time: RegistrationTime) => ({ date, time })),
          })

          // date without any groups selected should receive defaultGroups
          expect(
            applyNewGroupsToDogEventDates({ dates, endDate: date2, startDate: date }, defaultGroups, newDates)
          ).toEqual({
            classes: [],
            dates: [
              ...expected.map((time: RegistrationTime) => ({ date, time })),
              ...defaultGroups.map((time) => ({ date: date2, time })),
            ],
          })
        }
      )
    })
  })

  describe('copyDogEvent', () => {
    it('should remove id', () => expect(copyDogEvent(eventWithParticipantsInvited).id).toEqual(''))
    it('should add "Kopio - " to name', () =>
      expect(copyDogEvent(eventWithParticipantsInvited).name.startsWith('Kopio -')).toBeTruthy())
    it('should set state to draft', () => expect(copyDogEvent(eventWithParticipantsInvited).state).toEqual('draft'))
    it('should reset start list publishing', () =>
      expect(copyDogEvent({ ...eventWithParticipantsInvited, startListPublished: true }).startListPublished).toBe(
        false
      ))
    it('should reset start number and results publishing', () => {
      // An inherited flag would skip the whole decision: absent-means-published for numbers that
      // predate the field, and a copied resultsPublished would advertise results that do not exist.
      const copy = copyDogEvent({
        ...eventWithParticipantsInvited,
        resultsPublished: { ALO: true },
        startNumbersPublished: true,
      })
      expect(copy.startNumbersPublished).toBe(false)
      expect(copy.resultsPublished).toBeUndefined()
    })
    it('should reset entries and members', () => {
      const copy = copyDogEvent({ ...eventWithParticipantsInvited, entries: 15, members: 10 })
      expect(copy.entries).toBe(0)
      expect(copy.members).toBe(0)
    })
    it('should set startDate', () =>
      expect(copyDogEvent(eventWithParticipantsInvited).startDate).toEqual(newEventStartDate))
    it('should set endDate', () =>
      expect(copyDogEvent(eventWithParticipantsInvited).endDate).toEqual(newEventStartDate))
    it('should set endDate on two day event', () =>
      expect(copyDogEvent(eventWithEntryClosing).endDate).toEqual(addDays(newEventStartDate, 1)))
    it('should set entryStartDate / entryEndDate', () => {
      const copy = copyDogEvent({ ...eventWithParticipantsInvited, entryOrigEndDate: new Date() })
      expect(copy.entryStartDate).toEqual(newEventEntryStartDate)
      expect(copy.entryEndDate).toEqual(newEventEntryEndDate)
      expect(copy.entryOrigEndDate).toBeUndefined()
    })
    it('should update classes', () => {
      const copy = copyDogEvent(eventWithParticipantsInvited)
      expect(copy.classes).toHaveLength(2)
      for (let i = 0; i < 2; i++) {
        expect(copy.classes[i].places).toBe(eventWithParticipantsInvited.classes[i].places)
        expect(copy.classes[i].entries).toBe(0)
        expect(copy.classes[i].members).toBe(0)
        expect(copy.classes[i].date).toEqual(newEventStartDate)
      }
    })
    it('should update class dates on muptiple day event', () => {
      const copy = copyDogEvent({
        ...eventWithEntryClosing,
        classes: [
          { class: 'ALO', date: eventWithEntryClosing.startDate, places: 2 },
          { class: 'ALO', date: eventWithEntryClosing.endDate, places: 12 },
        ],
      })
      expect(copy.classes[0].date).toEqual(copy.startDate)
      expect(copy.classes[1].date).toEqual(copy.endDate)
    })

    it('should update dates', () => {
      const copy = copyDogEvent({
        ...eventWithEntryClosing,
        dates: [
          { date: eventWithEntryClosing.startDate, time: 'ap' },
          { date: eventWithEntryClosing.endDate, time: 'ip' },
        ],
      })

      expect(copy.dates).toHaveLength(2)
      expect(copy.dates?.[0].date).toEqual(copy.startDate)
      expect(copy.dates?.[1].date).toEqual(copy.endDate)
    })

    it('should copy and adjust placesPerDay', () => {
      // Create an event with placesPerDay
      const origStartDate = new Date(2023, 5, 15) // June 15, 2023
      const origEndDate = new Date(2023, 5, 16) // June 16, 2023
      const event = {
        ...eventWithEntryClosing,
        endDate: origEndDate,
        placesPerDay: {
          '2023-06-15': 10, // First day
          '2023-06-16': 15, // Second day
        },
        startDate: origStartDate,
      }

      const copy = copyDogEvent(event)

      // Calculate expected dates based on the day difference
      const dayDiff = differenceInDays(newEventStartDate, origStartDate)
      const expectedFirstDate = formatDate(addDays(origStartDate, dayDiff), 'yyyy-MM-dd')
      const expectedSecondDate = formatDate(addDays(origEndDate, dayDiff), 'yyyy-MM-dd')

      // Verify placesPerDay was copied and dates were adjusted
      expect(copy.placesPerDay).toBeDefined()
      expect(Object.keys(copy.placesPerDay!)).toHaveLength(2)
      expect(copy.placesPerDay?.[expectedFirstDate]).toBe(10)
      expect(copy.placesPerDay?.[expectedSecondDate]).toBe(15)
    })
  })
})

describe('defaultEntryStartDate and defaultEntryEndDate', () => {
  it('should calculate correct entry start date', () => {
    const eventStartDate = new Date(2023, 5, 15) // June 15, 2023
    const expectedStartDate = new Date(2023, 5, 15)
    expectedStartDate.setDate(expectedStartDate.getDate() - 6 * 7) // 6 weeks before

    expect(defaultEntryStartDate(eventStartDate).getTime()).toEqual(expectedStartDate.getTime())
  })

  it('should calculate correct entry end date', () => {
    const eventStartDate = new Date(2023, 5, 15) // June 15, 2023
    const expectedEndDate = new Date(2023, 5, 15)
    expectedEndDate.setDate(expectedEndDate.getDate() - 3 * 7) // 3 weeks before

    expect(defaultEntryEndDate(eventStartDate).getTime()).toEqual(expectedEndDate.getTime())
  })
})

describe('isDetaultEntryStartDate and isDetaultEntryEndDate', () => {
  it('should return true when date is undefined', () => {
    const eventStartDate = new Date(2023, 5, 15)
    expect(isDetaultEntryStartDate(undefined, eventStartDate)).toBe(true)
    expect(isDetaultEntryEndDate(undefined, eventStartDate)).toBe(true)
  })

  it('should return true when date matches default entry start date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const entryStartDate = defaultEntryStartDate(eventStartDate)

    expect(isDetaultEntryStartDate(entryStartDate, eventStartDate)).toBe(true)
  })

  it('should return true when date matches default entry end date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const entryEndDate = defaultEntryEndDate(eventStartDate)

    expect(isDetaultEntryEndDate(entryEndDate, eventStartDate)).toBe(true)
  })

  it('should return false when date does not match default entry start date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const nonDefaultDate = new Date(2023, 4, 1) // May 1, 2023

    expect(isDetaultEntryStartDate(nonDefaultDate, eventStartDate)).toBe(false)
  })

  it('should return false when date does not match default entry end date', () => {
    const eventStartDate = new Date(2023, 5, 15)
    const nonDefaultDate = new Date(2023, 4, 1) // May 1, 2023

    expect(isDetaultEntryEndDate(nonDefaultDate, eventStartDate)).toBe(false)
  })
})

describe('eventRegistrationDateKey', () => {
  it('should generate a key in the format date-time', () => {
    const date = new Date(2023, 5, 15, 12) // June 15, 2023
    const time = 'ap'
    const registrationDate: RegistrationDate = { date, time }

    // Expected format: YYYY-MM-DD-time
    const expected = '2023-06-15-ap'

    expect(eventRegistrationDateKey(registrationDate)).toEqual(expected)
  })

  it('should use event timezone (Europe/Helsinki) day, not UTC day', () => {
    // Helsinki summer time is +03:00.
    // This instant is June 15th in Helsinki, but still June 14th in UTC.
    const date = new Date('2023-06-15T00:30:00+03:00')
    expect(date.toISOString().slice(0, 10)).toEqual('2023-06-14') // would be wrong key if used

    expect(eventRegistrationDateKey({ date, time: 'ap' })).toEqual('2023-06-15-ap')
  })

  it('should handle different times', () => {
    const date = new Date(2023, 5, 15, 12)

    expect(eventRegistrationDateKey({ date, time: 'ap' })).toEqual('2023-06-15-ap')
    expect(eventRegistrationDateKey({ date, time: 'ip' })).toEqual('2023-06-15-ip')
    expect(eventRegistrationDateKey({ date, time: 'kp' })).toEqual('2023-06-15-kp')
  })

  it('should handle different dates', () => {
    const time = 'ap'

    expect(eventRegistrationDateKey({ date: new Date(2023, 0, 1, 12), time })).toEqual('2023-01-01-ap')
    expect(eventRegistrationDateKey({ date: new Date(2023, 11, 31, 12), time })).toEqual('2023-12-31-ap')
  })
})

describe('localizedEventName and localizedEventDescription', () => {
  // KOE-1263: `name` and `description` stay the Finnish texts; the maps carry the translations.
  const event = {
    description: 'Lisätiedot',
    descriptions: { en: 'Additional info' },
    name: 'Nimi',
    names: { en: 'Name' },
  }

  it('returns the Finnish texts for fi', () => {
    expect(localizedEventName(event, 'fi')).toEqual('Nimi')
    expect(localizedEventDescription(event, 'fi')).toEqual('Lisätiedot')
  })

  it('returns the translations for en', () => {
    expect(localizedEventName(event, 'en')).toEqual('Name')
    expect(localizedEventDescription(event, 'en')).toEqual('Additional info')
  })

  it('falls back to the Finnish texts without a translation', () => {
    expect(localizedEventName({ name: 'Nimi' }, 'en')).toEqual('Nimi')
    expect(localizedEventDescription({ description: 'Lisätiedot' }, 'en')).toEqual('Lisätiedot')
  })

  it('falls back to the Finnish texts for an empty translation', () => {
    expect(localizedEventName({ name: 'Nimi', names: { en: '' } }, 'en')).toEqual('Nimi')
    expect(localizedEventDescription({ description: 'Lisätiedot', descriptions: { en: '' } }, 'en')).toEqual(
      'Lisätiedot'
    )
  })
})

describe('sanitizeDogEvent', () => {
  /**
   * sanitizeDogEvent must strip the private fields and pass everything else through whatever the
   * values are, so these fixtures deliberately do not match JsonDogEvent; converted here.
   */
  const asDogEvent = (event: Record<string, unknown>) => event as unknown as JsonDogEvent

  it('should remove private fields from event', () => {
    const event = {
      createdBy: 'user-1',
      deletedAt: new Date(),
      deletedBy: 'user-2',
      headquarters: { zipCode: '12345' },
      id: 'event-1',
      invitationAttachment: 'attachment.pdf',
      invitationAttachmentHistory: { 'attachment.pdf': { uploadedAt: new Date() } },
      invitationAttachments: { ALO: 'attachment.pdf' },
      kcId: 12345,
      modifiedBy: 'user-3',
      name: 'Test Event',
      official: 'official-info',
      publicField1: 'public-value-1',
      publicField2: 'public-value-2',
      registrationGroupsLock: { expiresAt: Date.now() + 90_000, token: 'secret' },
      registrationPaymentsLock: { expiresAt: Date.now() + 90_000, token: 'payment-secret' },
      secretary: 'secretary-info',
    }

    const sanitized = sanitizeDogEvent(asDogEvent(event))

    // Check that private fields are removed
    expect(sanitized.createdBy).toBeUndefined()
    expect(sanitized.deletedAt).toBeUndefined()
    expect(sanitized.deletedBy).toBeUndefined()
    expect(sanitized.headquarters).toBeUndefined()
    expect(sanitized.kcId).toBeUndefined()
    expect(sanitized.invitationAttachment).toBeUndefined()
    expect(sanitized.invitationAttachmentHistory).toBeUndefined()
    expect(sanitized.invitationAttachments).toBeUndefined()
    expect(sanitized.modifiedBy).toBeUndefined()
    expect(sanitized.secretary).toBeUndefined()
    expect(sanitized.official).toBeUndefined()
    expect(Object.hasOwn(sanitized, 'registrationGroupsLock')).toBe(false)
    expect(Object.hasOwn(sanitized, 'registrationPaymentsLock')).toBe(false)

    // Check that public fields are preserved
    expect(sanitized.id).toEqual('event-1')
    expect(sanitized.name).toEqual('Test Event')
    expect(sanitized).toEqual(
      expect.objectContaining({ publicField1: 'public-value-1', publicField2: 'public-value-2' })
    )
  })

  it('should handle empty event object', () => {
    const event = { id: 'event-1' }
    const sanitized = sanitizeDogEvent(asDogEvent(event))

    expect(sanitized).toEqual({ id: 'event-1' })
  })

  it('turns the stored timeline into liveTurns without the registration ids', () => {
    const event = {
      id: 'event-1',
      turns: [
        {
          dogs: [{ name: 'Dog', number: 5 }],
          id: 'turn-1',
          registrationIds: ['run-1'],
          startedAt: '2026-09-12T08:00:00.000Z',
          stationId: 'post-1',
        },
      ],
    }

    const sanitized = sanitizeDogEvent(asDogEvent(event))

    expect(Object.hasOwn(sanitized, 'turns')).toBe(false)
    expect(sanitized.liveTurns).toEqual([
      { dogs: [{ name: 'Dog', number: 5 }], id: 'turn-1', startedAt: '2026-09-12T08:00:00.000Z', stationId: 'post-1' },
    ])
  })

  it('should handle event with only private fields', () => {
    const event = {
      createdBy: 'user-1',
      deletedAt: new Date(),
      deletedBy: 'user-2',
      headquarters: { zipCode: '12345' },
      invitationAttachment: 'attachment.pdf',
      invitationAttachmentHistory: { 'attachment.pdf': { uploadedAt: new Date() } },
      invitationAttachments: { ALO: 'attachment.pdf' },
      kcId: 12345,
      modifiedBy: 'user-3',
      official: 'official-info',
      secretary: 'secretary-info',
    }

    const sanitized = sanitizeDogEvent(asDogEvent(event))

    expect(sanitized).toEqual({})
  })
})

describe('placesForClass', () => {
  it('returns 0 for a nullish event', () => {
    expect(placesForClass(undefined, 'ALO')).toBe(0)
    expect(placesForClass(null, 'ALO')).toBe(0)
  })

  it('sums the class-specific places when set', () => {
    const event = {
      classes: [
        { class: 'ALO' as const, places: 5 },
        { class: 'ALO' as const, places: 3 },
        { class: 'AVO' as const, places: 100 },
      ],
      places: 999,
    }
    expect(placesForClass(event, 'ALO')).toBe(8)
  })

  it('falls back to the day totals for the class’s dates when no per-class places are set', () => {
    // Regression: the search page showed 0 for every class when capacity was tracked
    // per day (placesPerDay) instead of per class.
    const event = {
      classes: [
        { class: 'ALO' as const, date: new Date('2026-11-07') },
        { class: 'VOI' as const, date: new Date('2026-11-08') },
      ],
      places: 13,
      placesPerDay: { '2026-11-07': 10, '2026-11-08': 3 },
    }
    expect(placesForClass(event, 'ALO')).toBe(10)
    expect(placesForClass(event, 'VOI')).toBe(3)
  })

  it('sums day totals across all of a class’s dates', () => {
    const event = {
      classes: [
        { class: 'ALO' as const, date: new Date('2026-11-07') },
        { class: 'ALO' as const, date: new Date('2026-11-08') },
      ],
      places: 13,
      placesPerDay: { '2026-11-07': 10, '2026-11-08': 3 },
    }
    expect(placesForClass(event, 'ALO')).toBe(13)
  })

  it('falls back to the event-wide total when there is no per-class or per-day data', () => {
    const event = { classes: [{ class: 'ALO' as const }], places: 20 }
    expect(placesForClass(event, 'ALO')).toBe(20)
  })

  it('returns 0 rather than the event-wide total when there are several classes and no breakdown', () => {
    // Regression: the "total" places mode zeroes out every class's own `places`, so attributing
    // the whole event's total to each class independently would multiply it by the class count.
    const event = {
      classes: [{ class: 'ALO' as const }, { class: 'AVO' as const }, { class: 'VOI' as const }],
      places: 20,
    }
    expect(placesForClass(event, 'ALO')).toBe(0)
    expect(placesForClass(event, 'AVO')).toBe(0)
    expect(placesForClass(event, 'VOI')).toBe(0)
  })
})

describe('hasExplicitPlacesForClass', () => {
  it('returns false for a nullish event', () => {
    expect(hasExplicitPlacesForClass(undefined, 'ALO')).toBe(false)
    expect(hasExplicitPlacesForClass(null, 'ALO')).toBe(false)
  })

  it('returns true when the class has its own places', () => {
    const event = { classes: [{ class: 'ALO' as const, places: 5 }] }
    expect(hasExplicitPlacesForClass(event, 'ALO')).toBe(true)
  })

  it('returns true when the class has a day total via placesPerDay', () => {
    const event = {
      classes: [{ class: 'ALO' as const, date: new Date('2026-11-07') }],
      placesPerDay: { '2026-11-07': 10 },
    }
    expect(hasExplicitPlacesForClass(event, 'ALO')).toBe(true)
  })

  it('returns false when neither the class nor its days have an explicit total', () => {
    const event = {
      classes: [{ class: 'ALO' as const, date: new Date('2026-11-07') }],
      placesPerDay: { '2026-11-08': 10 },
    }
    expect(hasExplicitPlacesForClass(event, 'ALO')).toBe(false)
  })
})

describe('registrationDatesOutsideClass', () => {
  // 2026-09-25T21:00Z is 26.9. and 2026-09-26T21:00Z is 27.9. in the event time zone
  const event = {
    classes: [
      { class: 'ALO', date: '2026-09-25T21:00:00.000Z' },
      { class: 'AVO', date: '2026-09-25T21:00:00.000Z' },
      { class: 'VOI', date: '2026-09-26T21:00:00.000Z' },
    ],
    endDate: '2026-09-27T20:59:59.999Z',
    startDate: '2026-09-25T21:00:00.000Z',
  }

  it('returns an empty array for empty or missing dates', () => {
    expect(registrationDatesOutsideClass(event, 'VOI', [])).toEqual([])
    expect(registrationDatesOutsideClass(event, 'VOI', undefined)).toEqual([])
  })

  it('accepts dates that fall on the class days', () => {
    expect(registrationDatesOutsideClass(event, 'VOI', [{ date: '2026-09-26T21:00:00.000Z', time: 'kp' }])).toEqual([])
    expect(registrationDatesOutsideClass(event, 'ALO', [{ date: '2026-09-25T21:00:00.000Z', time: 'kp' }])).toEqual([])
  })

  it('returns the dates that fall outside the class days', () => {
    const dates = [{ date: '2026-09-25T21:00:00.000Z', time: 'kp' }]
    expect(registrationDatesOutsideClass(event, 'VOI', dates)).toEqual(dates)
  })

  it('accepts Date-typed dates too', () => {
    const dateEvent = {
      classes: [{ class: 'VOI', date: new Date('2026-09-26T21:00:00.000Z') }],
      endDate: new Date('2026-09-27T20:59:59.999Z'),
      startDate: new Date('2026-09-25T21:00:00.000Z'),
    }
    const mismatch = [{ date: new Date('2026-09-25T21:00:00.000Z') }]
    expect(registrationDatesOutsideClass(dateEvent, 'VOI', mismatch)).toEqual(mismatch)
    expect(registrationDatesOutsideClass(dateEvent, 'VOI', [{ date: new Date('2026-09-26T21:00:00.000Z') }])).toEqual(
      []
    )
  })

  it('falls back to the whole event range when the event has no classes for the registration', () => {
    const noClasses = { classes: [], endDate: event.endDate, startDate: event.startDate }
    expect(registrationDatesOutsideClass(noClasses, undefined, [{ date: '2026-09-25T21:00:00.000Z' }])).toEqual([])
    expect(registrationDatesOutsideClass(noClasses, undefined, [{ date: '2026-09-26T21:00:00.000Z' }])).toEqual([])
    const outside = [{ date: '2026-09-27T21:00:00.000Z' }]
    expect(registrationDatesOutsideClass(noClasses, undefined, outside)).toEqual(outside)
  })

  it('falls back to the whole event range when the registration class is not in the event', () => {
    expect(registrationDatesOutsideClass(event, 'VAL', [{ date: '2026-09-25T21:00:00.000Z' }])).toEqual([])
    const outside = [{ date: '2026-09-24T21:00:00.000Z' }]
    expect(registrationDatesOutsideClass(event, 'VAL', outside)).toEqual(outside)
  })

  describe('isOfficialEventType', () => {
    it('accepts the event types Koekalenteri supports without any event type data', () => {
      expect(isOfficialEventType('NOME-B')).toEqual(true)
      expect(isOfficialEventType('NOWT SM')).toEqual(true)
    })

    it('accepts an event type the Kennel Club sync flagged official', () => {
      expect(isOfficialEventType('MEJÄ', true)).toEqual(true)
      expect(isOfficialEventType('VEPE', true)).toEqual(true)
    })

    it('rejects event types that are neither supported nor flagged official', () => {
      expect(isOfficialEventType('MEJÄ')).toEqual(false)
      expect(isOfficialEventType('Koulutus', false)).toEqual(false)
      expect(isOfficialEventType(undefined, true)).toEqual(false)
      expect(isOfficialEventType(null)).toEqual(false)
    })
  })

  describe('hasRetrieveTypeChoice', () => {
    it.each(['NOME-B', 'NOME-B SM'])('is the B-trials (%s) that choose between game and dummies', (eventType) => {
      expect(hasRetrieveTypeChoice(eventType)).toEqual(true)
    })

    it.each(['NOU', 'NOME-A', 'NOWT', 'NKM', 'Koulutus', '', undefined, null])('does not apply to %s', (eventType) => {
      expect(hasRetrieveTypeChoice(eventType)).toEqual(false)
    })
  })

  describe('hasMockTrialChoice (KOE-308)', () => {
    it('is the NOWT that can be a Mock trial', () => {
      expect(hasMockTrialChoice('NOWT')).toEqual(true)
    })

    it.each(['NOWT SM', 'NOME-A', 'NOME-B', 'NOU', 'Koulutus', '', undefined, null])(
      'does not apply to %s',
      (eventType) => {
        expect(hasMockTrialChoice(eventType)).toEqual(false)
      }
    )
  })

  describe('isMockTrialClass (KOE-308)', () => {
    it('runs AVO and VOI, never ALO', () => {
      expect(isMockTrialClass('ALO')).toEqual(false)
      expect(isMockTrialClass('AVO')).toEqual(true)
      expect(isMockTrialClass('VOI')).toEqual(true)
    })
  })

  describe('eventTypeLabel (KOE-308)', () => {
    it('marks a Mock trial after the event type', () => {
      expect(eventTypeLabel({ eventType: 'NOWT', mockTrial: true })).toEqual('NOWT (Mock trial)')
    })

    it.each([false, undefined])('is the bare event type otherwise (mockTrial: %s)', (mockTrial) => {
      expect(eventTypeLabel({ eventType: 'NOWT', mockTrial })).toEqual('NOWT')
    })
  })

  describe('hasSharedReserveList', () => {
    it.each(['NOWT', 'NOWT SM'])('is the WT trials (%s) that keep one reserve list for the trial', (eventType) => {
      expect(hasSharedReserveList(eventType)).toEqual(true)
    })

    it.each(['NOU', 'NOME-A', 'NOME-B', 'NKM', 'Koulutus', '', undefined, null])(
      'does not apply to %s',
      (eventType) => {
        expect(hasSharedReserveList(eventType)).toEqual(false)
      }
    )
  })
})

describe('publishing results', () => {
  describe('isResultsPublished', () => {
    it('treats an absent flag as not published', () => {
      // The start list reads the other way, because its records predate the flag. A result nobody
      // released must never appear, so the same shape carries the opposite default.
      expect(isResultsPublished({}, 'ALO')).toBe(false)
      expect(isStartListPublishedForClass({}, 'ALO')).toBe(true)
    })

    it('publishes every class when the flag is a plain true', () => {
      expect(isResultsPublished({ resultsPublished: true }, 'ALO')).toBe(true)
    })

    it('publishes only the classes the map names', () => {
      const event = { resultsPublished: { ALO: true } }

      expect(isResultsPublished(event, 'ALO')).toBe(true)
      expect(isResultsPublished(event, 'AVO')).toBe(false)
    })

    it('reads the one flag of a classless event (KOE-1464)', () => {
      expect(isResultsPublished({ resultsPublished: true })).toBe(true)
      expect(isResultsPublished({ resultsPublished: false })).toBe(false)
      expect(isResultsPublished({})).toBe(false)
      // A class map names classes, so it has nothing to say about an event without one.
      expect(isResultsPublished({ resultsPublished: { ALO: true } })).toBe(false)
    })
  })

  describe('hasAvailableResults', () => {
    // Held in 2021 and left 'picked': only the dates and the flags open anything.
    const past = { endDate: new Date('2021-02-11'), startDate: new Date('2021-02-10'), state: 'picked' as const }
    const classes = [{ class: 'ALO' as const }, { class: 'AVO' as const }]

    it('needs the list and the results of a classless event public', () => {
      expect(hasAvailableResults({ ...past, resultsPublished: true, startListPublished: true })).toBe(true)
      expect(hasAvailableResults({ ...past, resultsPublished: true, startListPublished: false })).toBe(false)
      expect(hasAvailableResults({ ...past, resultsPublished: false, startListPublished: true })).toBe(false)
    })

    it('waits for the dogs to have run', () => {
      const ahead = { endDate: addDays(new Date(), 31), startDate: addDays(new Date(), 30), state: 'picked' as const }
      expect(hasAvailableResults({ ...ahead, resultsPublished: true, startListPublished: true })).toBe(false)
    })

    it('needs one class with both its list and its results public', () => {
      expect(hasAvailableResults({ ...past, classes, resultsPublished: { AVO: true }, startListPublished: true })).toBe(
        true
      )
      // ALO's list is public and AVO's results are, but no class has both.
      expect(
        hasAvailableResults({
          ...past,
          classes,
          resultsPublished: { AVO: true },
          startListPublished: { ALO: true, AVO: false },
        })
      ).toBe(false)
    })
  })

  describe('canPublishResults', () => {
    it('waits until the dogs have run', () => {
      // A start list exists before the event; a result does not.
      expect(canPublishResults('invited')).toBe(false)
      expect(canPublishStartList('invited')).toBe(true)

      expect(canPublishResults('started')).toBe(true)
      expect(canPublishResults('ended')).toBe(true)
      expect(canPublishResults('completed')).toBe(true)
    })

    it('also counts the calendar, because nobody advances the state on the morning of a test', () => {
      const today = new Date()
      const runningToday = { endDate: today, startDate: today, state: 'invited' as const }

      // getEventProgress already reads this event as started, from the same dates. A greyed-out publish
      // button beside a progress bar saying "käynnissä" leaves the secretary no way to tell why.
      expect(canPublishResults('invited', runningToday)).toBe(true)

      const nextWeek = addDays(today, 7)
      expect(canPublishResults('invited', { ...runningToday, endDate: nextWeek, startDate: nextWeek })).toBe(false)
    })

    it('lets the event state veto the calendar, but only where the event never happened', () => {
      const today = new Date()

      // A cancelled event whose classes kept an earlier state must not become publishable by date alone.
      expect(canPublishResults('invited', { endDate: today, startDate: today, state: 'cancelled' })).toBe(false)
      expect(canPublishResults('invited', { endDate: today, startDate: today, state: 'draft' })).toBe(false)

      // 'confirmed' is not such a state: an event left in it was still held. Once its dates have
      // passed the stepper reads it as ended, and its results are publishable — otherwise a small
      // event that never sends the emails that would advance its state could never publish at all.
      const lastYear = addDays(today, -365)
      expect(canPublishResults('confirmed', { endDate: lastYear, startDate: lastYear, state: 'confirmed' })).toBe(true)

      // Its own day is the one gap, and it is the stepper's: isEventOngoing excludes 'confirmed', so
      // the stepper does not read this event as running either. The gate follows that single truth
      // rather than second-guessing it — publishing opens once the day is over.
      expect(canPublishResults('confirmed', { endDate: today, startDate: today, state: 'confirmed' })).toBe(false)
      // An event whose invitations went out reaches 'invited', which the stepper does read as running.
      expect(canPublishResults('invited', { endDate: today, startDate: today, state: 'invited' })).toBe(true)
    })
  })

  describe('canPublishStartList', () => {
    it('opens on the calendar too, so a finished event can still publish its list', () => {
      const lastYear = addDays(new Date(), -365)

      // Results reach the public on the start list's rows, and they are entered after the dogs have
      // run — so a finished event is exactly when publishing the list is needed.
      expect(canPublishStartList('confirmed')).toBe(false)
      expect(canPublishStartList('confirmed', { endDate: lastYear, startDate: lastYear, state: 'confirmed' })).toBe(
        true
      )
      expect(canPublishStartList('confirmed', { endDate: lastYear, startDate: lastYear, state: 'cancelled' })).toBe(
        false
      )
    })
  })

  describe('a start list the calendar alone opened', () => {
    const lastYear = addDays(new Date(), -365)
    const past = { endDate: lastYear, startDate: lastYear, state: 'confirmed' as const }

    it('still has to be published on purpose', () => {
      // An absent flag is the legacy "published" default. It must not put a list on the web merely
      // because the event was confirmed and its date went by.
      expect(isStartListAvailableForClass(past, { class: 'ALO' })).toBe(false)
      expect(isStartListAvailableForClass({ ...past, startListPublished: { ALO: true } }, { class: 'ALO' })).toBe(true)
    })
  })

  describe('a picked class published on purpose (KOE-1509)', () => {
    // A one-day NOME-B with only ALO: the place notices went, the invitations never did.
    const oneDay = {
      classes: [{ class: 'ALO' as const, date: '2026-06-13', state: 'picked' as const }],
      endDate: '2026-06-13',
      startDate: '2026-06-13',
      startListPublished: { ALO: true },
      state: 'picked' as const,
    }
    const dog = { class: 'ALO', group: { date: '2026-06-13' } }
    // The secretary published the list for the invited first day; the second day was added later.
    const twoDays = {
      classes: [
        { class: 'ALO' as const, date: '2026-06-13', state: 'invited' as const },
        { class: 'ALO' as const, date: '2026-06-14', state: 'picked' as const },
      ],
      endDate: '2026-06-14',
      startDate: '2026-06-13',
      startListPublished: { ALO: true },
      state: 'confirmed' as const,
    }
    const firstDay = { class: 'ALO', group: { date: '2026-06-13' } }
    const secondDay = { class: 'ALO', group: { date: '2026-06-14' } }

    describe('once the trial is over', () => {
      freezeClockAt('2026-06-15')

      it('opens the list, and the results riding on it', () => {
        // The invitations can no longer be sent, so the list follows the explicit publish.
        expect(isStartListAvailableForClass(oneDay, oneDay.classes[0])).toBe(true)
        expect(isStartListAvailableForClass({ ...oneDay, classes: undefined }, oneDay.classes[0])).toBe(true)
        expect(isStartListAvailableForRegistration(oneDay, dog)).toBe(true)
        expect(isResultsAvailableForRegistration({ ...oneDay, resultsPublished: { ALO: true } }, dog)).toBe(true)
      })

      it.each([
        { case: 'a cancelled trial', event: { ...oneDay, state: 'cancelled' as const } },
        { case: 'no flag', event: { ...oneDay, startListPublished: undefined } },
        { case: 'a hidden class', event: { ...oneDay, startListPublished: { ALO: false } } },
        // An event-wide true is the old, pre-map flag: it must not reveal a picked class at deploy.
        { case: 'an event-wide flag', event: { ...oneDay, startListPublished: true } },
      ])('keeps it hidden for $case', ({ event }) => {
        expect(isStartListAvailableForRegistration(event, dog)).toBe(false)
      })

      it('keeps a picked day hidden when another day of the class was invited', () => {
        // The flag was meant for the invited day; it cannot tell the picked one apart.
        expect(isStartListAvailableForRegistration(twoDays, firstDay)).toBe(true)
        expect(isStartListAvailableForRegistration(twoDays, secondDay)).toBe(false)
      })

      it('keeps a picked day hidden beside a day that has the invited state from the event', () => {
        const inherited = {
          ...twoDays,
          classes: [
            { class: 'ALO' as const, date: '2026-06-13' },
            { class: 'ALO' as const, date: '2026-06-14', state: 'picked' as const },
          ],
          state: 'invited' as const,
        }
        expect(isStartListAvailableForRegistration(inherited, firstDay)).toBe(true)
        expect(isStartListAvailableForRegistration(inherited, secondDay)).toBe(false)
      })

      it('opens a picked class beside an invited class of another name', () => {
        // Only another day of the same class holds it back.
        const twoClasses = {
          ...oneDay,
          classes: [
            { class: 'ALO' as const, date: '2026-06-13', state: 'invited' as const },
            { class: 'AVO' as const, date: '2026-06-13', state: 'picked' as const },
          ],
          startListPublished: { ALO: true, AVO: true },
        }
        expect(isStartListAvailableForRegistration(twoClasses, { class: 'AVO', group: { date: '2026-06-13' } })).toBe(
          true
        )
      })
    })

    describe('on the last day of the trial', () => {
      freezeClockAt('2026-06-14')

      it('keeps the picked class hidden while the invitations can still go', () => {
        const today = {
          ...oneDay,
          classes: [{ ...oneDay.classes[0], date: '2026-06-14' }],
          endDate: '2026-06-14',
          startDate: '2026-06-14',
        }
        expect(isStartListAvailableForRegistration(today, { class: 'ALO', group: { date: '2026-06-14' } })).toBe(false)
      })

      it('keeps the picked day hidden beside the invited one', () => {
        expect(isStartListAvailableForRegistration(twoDays, firstDay)).toBe(true)
        expect(isStartListAvailableForRegistration(twoDays, secondDay)).toBe(false)
      })
    })
  })

  describe('isResultsAvailableForClass', () => {
    it('is hidden while the start list carrying it is hidden', () => {
      // A result has no transport of its own: it is a field on the start list's rows.
      const event = { resultsPublished: { ALO: true }, startListPublished: { ALO: false }, state: 'ended' as const }

      expect(isResultsAvailableForClass(event, { class: 'ALO' })).toBe(false)
      expect(isResultsAvailableForClass({ ...event, startListPublished: { ALO: true } }, { class: 'ALO' })).toBe(true)
    })

    it('needs both a state that allows it and an explicit publish', () => {
      const published = { resultsPublished: { ALO: true }, state: 'ended' as const }

      expect(isResultsAvailableForClass(published, { class: 'ALO' })).toBe(true)
      // Published, but the class has not started.
      expect(isResultsAvailableForClass(published, { class: 'ALO', state: 'invited' })).toBe(false)
      // Started, but never published.
      expect(isResultsAvailableForClass({ state: 'ended' }, { class: 'ALO' })).toBe(false)
    })
  })
})

/**
 * A class running on two days publishes each day on its own (KOE-1510): the first day's results go out
 * that evening while the second day is still to be scored.
 */
describe('results published day by day', () => {
  const twoDays = {
    classes: [
      { class: 'ALO' as const, date: '2026-09-12' },
      { class: 'ALO' as const, date: '2026-09-13' },
      { class: 'AVO' as const, date: '2026-09-12' },
    ],
    endDate: '2026-09-13',
    startDate: '2026-09-12',
  }

  describe('isResultsPublishedForDay', () => {
    it('reads a listed day, stored or revived, and nothing else', () => {
      for (const day of ['2026-09-12', new Date('2026-09-12')]) {
        const event = { resultsPublished: { ALO: [day] } }
        expect(isResultsPublishedForDay(event, 'ALO', '2026-09-12')).toBe(true)
        expect(isResultsPublishedForDay(event, 'ALO', new Date('2026-09-13'))).toBe(false)
        expect(isResultsPublishedForDay(event, 'AVO', '2026-09-12')).toBe(false)
      }
    })

    it('reads a plain true as every day and an absent flag as none', () => {
      expect(isResultsPublishedForDay({ resultsPublished: { ALO: true } }, 'ALO', '2026-09-13')).toBe(true)
      expect(isResultsPublishedForDay({}, 'ALO', '2026-09-12')).toBe(false)
      expect(isResultsPublishedForDay({ resultsPublished: { ALO: ['2026-09-12'] } }, 'ALO', undefined)).toBe(false)
    })

    it('reads the days of a classless event from its one scope', () => {
      const event = { resultsPublished: ['2026-09-26'] }
      expect(isResultsPublishedForDay(event, undefined, '2026-09-26')).toBe(true)
      expect(isResultsPublishedForDay(event, undefined, '2026-09-27')).toBe(false)
    })
  })

  describe('isResultsPublished and hasAllResultsPublished', () => {
    it('count a class only once every one of its days is out', () => {
      const firstDay = { ...twoDays, resultsPublished: { ALO: ['2026-09-12'], AVO: true } }
      expect(isResultsPublished(firstDay, 'ALO')).toBe(false)
      expect(isResultsPublished(firstDay, 'AVO')).toBe(true)
      expect(hasAllResultsPublished(firstDay)).toBe(false)

      const bothDays = { ...twoDays, resultsPublished: { ALO: ['2026-09-12', '2026-09-13'], AVO: true } }
      expect(hasAllResultsPublished(bothDays)).toBe(true)
      expect(hasAllResultsPublished({ ...twoDays, resultsPublished: { ALO: true, AVO: true } })).toBe(true)
    })

    it('count a two-day classless event only once both its days are out', () => {
      const classless = { classes: [], endDate: '2026-09-27', startDate: '2026-09-26' }
      expect(hasAllResultsPublished({ ...classless, resultsPublished: ['2026-09-26'] })).toBe(false)
      expect(hasAllResultsPublished({ ...classless, resultsPublished: ['2026-09-26', '2026-09-27'] })).toBe(true)
    })
  })

  describe('withResultsDay', () => {
    const event = { ...twoDays, classes: twoDays.classes.map((item) => ({ ...item, state: undefined })) }

    it('publishes only the day it names, whatever the clock says', () => {
      expect(withResultsDay({ ...event, resultsPublished: undefined }, 'ALO', '2026-09-12', true)).toEqual({
        ALO: ['2026-09-12'],
        AVO: false,
      })
    })

    it('lists every day it publishes, never folding them into a plain true, and empties to false', () => {
      const firstDay = { ...event, resultsPublished: { ALO: ['2026-09-12'] } }
      expect(withResultsDay(firstDay, 'ALO', '2026-09-13', true)).toEqual({
        ALO: ['2026-09-12', '2026-09-13'],
        AVO: false,
      })
      expect(withResultsDay(firstDay, 'ALO', '2026-09-12', false)).toEqual({ ALO: false, AVO: false })
    })

    it('leaves a day the event form adds later unpublished', () => {
      // AVO runs on Saturday only: publishing it must not publish a Sunday added afterwards.
      const published = withResultsDay({ ...event, resultsPublished: undefined }, 'AVO', '2026-09-12', true)
      expect(published).toEqual({ ALO: false, AVO: ['2026-09-12'] })

      const withSunday = {
        ...event,
        classes: [...event.classes, { class: 'AVO' as const, date: '2026-09-13', state: undefined }],
        resultsPublished: published,
      }
      expect(isResultsPublishedForDay(withSunday, 'AVO', '2026-09-12')).toBe(true)
      expect(isResultsPublishedForDay(withSunday, 'AVO', '2026-09-13')).toBe(false)
    })

    it('keeps a stored true as it is, its meaning included, and publishing a day on it changes nothing', () => {
      const everyDay = { ...event, resultsPublished: { ALO: true, AVO: true } }
      expect(withResultsDay(everyDay, 'ALO', '2026-09-13', true)).toEqual({ ALO: true, AVO: true })
    })

    it('hides one day of a class published as a whole and keeps the other', () => {
      const everyDay = { ...event, resultsPublished: { ALO: true, AVO: true } }
      expect(withResultsDay(everyDay, 'ALO', '2026-09-12', false)).toEqual({ ALO: ['2026-09-13'], AVO: true })
    })

    it('keeps an event-wide true for every class while publishing one of them', () => {
      expect(withResultsDay({ ...event, resultsPublished: true }, 'ALO', '2026-09-13', false)).toEqual({
        ALO: ['2026-09-12'],
        AVO: true,
      })
    })

    it('stores the days as day keys, even where a revived date found its way into the flag', () => {
      // A date stands where the client's reviver would have put one; the stored list holds keys only.
      const revived = { ...event, resultsPublished: { ALO: [new Date('2026-09-12T09:00:00.000Z')] } }
      expect(withResultsDay(revived, 'AVO', '2026-09-12', true)).toEqual({ ALO: ['2026-09-12'], AVO: ['2026-09-12'] })
    })

    it('publishes a classless event day by day as its one scope', () => {
      const classless = { classes: [], endDate: '2026-09-27', resultsPublished: undefined, startDate: '2026-09-26' }
      expect(withResultsDay(classless, undefined, '2026-09-26', true)).toEqual(['2026-09-26'])
      expect(withResultsDay({ ...classless, resultsPublished: ['2026-09-26'] }, undefined, '2026-09-27', true)).toEqual(
        ['2026-09-26', '2026-09-27']
      )
    })
  })

  describe('foldDayScope (the start numbers collapse)', () => {
    const days = ['2026-09-12', '2026-09-13']

    it('empties to false', () => {
      expect(foldDayScope([], days)).toBe(false)
    })

    it('collapses every day to true, repeats and order aside', () => {
      expect(foldDayScope(['2026-09-13', '2026-09-12', '2026-09-13'], days)).toBe(true)
    })

    it('keeps part of the days as a sorted list without repeats', () => {
      // A three-day class with two of its days out, given out of order and once twice.
      const threeDays = [...days, '2026-09-14']
      expect(foldDayScope(['2026-09-13', '2026-09-12', '2026-09-13'], threeDays)).toEqual(['2026-09-12', '2026-09-13'])
      expect(foldDayScope(['2026-09-13/ip', '2026-09-12'], threeDays)).toEqual(['2026-09-12', '2026-09-13/ip'])
    })
  })

  describe('isSameResultsPublished', () => {
    const event = { ...twoDays, classes: twoDays.classes.map((item) => ({ ...item, state: undefined })) }

    it('reads the same days the same way, however they are written', () => {
      const stored = { ...event, resultsPublished: { ALO: ['2026-09-12'], AVO: true } }

      expect(isSameResultsPublished(stored, { ALO: [new Date('2026-09-11T21:00:00.000Z')], AVO: ['2026-09-12'] })).toBe(
        true
      )
      expect(isSameResultsPublished(stored, { ALO: ['2026-09-11T21:00:00.000Z'], AVO: true })).toBe(true)
      // Every day listed is every day.
      expect(
        isSameResultsPublished({ ...event, resultsPublished: true }, { ALO: ['2026-09-13', '2026-09-12'], AVO: true })
      ).toBe(true)
    })

    it('tells a different day, a hide or a missing class apart', () => {
      const stored = { ...event, resultsPublished: { ALO: ['2026-09-12'], AVO: true } }

      expect(isSameResultsPublished(stored, { ALO: ['2026-09-13'], AVO: true })).toBe(false)
      expect(isSameResultsPublished(stored, { ALO: false, AVO: true })).toBe(false)
      expect(isSameResultsPublished(stored, { ALO: ['2026-09-12'] })).toBe(false)
      expect(isSameResultsPublished(stored, null)).toBe(false)
      expect(isSameResultsPublished({ ...event, resultsPublished: undefined }, null)).toBe(true)
    })

    it('reads a classless event by its one scope, and a class map sent for it as publishing nothing', () => {
      const classless = { classes: [], endDate: '2026-09-27', startDate: '2026-09-26' }
      const firstDay = { ...classless, resultsPublished: ['2026-09-26'] }

      expect(isSameResultsPublished(firstDay, ['2026-09-26'])).toBe(true)
      expect(isSameResultsPublished(firstDay, ['2026-09-27'])).toBe(false)
      expect(isSameResultsPublished(firstDay, { NOU: true })).toBe(false)
      expect(isSameResultsPublished({ ...classless, resultsPublished: false }, { ALO: true })).toBe(true)
      expect(isSameResultsPublished({ ...classless, resultsPublished: true }, ['2026-09-27', '2026-09-26'])).toBe(true)
    })
  })

  describe('hasDayStarted', () => {
    it('opens a day at its midnight in Finnish time', () => {
      expect(hasDayStarted('2026-09-13', new Date('2026-09-12T23:59:00+03:00'))).toBe(false)
      expect(hasDayStarted('2026-09-13', new Date('2026-09-13T00:00:00+03:00'))).toBe(true)
      expect(hasDayStarted(new Date('2026-09-12'), new Date('2026-09-12T08:00:00+03:00'))).toBe(true)
    })
  })

  /**
   * A browser east of Finland read a bare day key as its own midnight, which in Tokyo is the evening
   * before in Finland: the second day keyed as the first, showed as published and could be published on
   * the first day, only for the server to refuse it.
   */
  describe('in a browser east of Finland', () => {
    beforeEach(() => {
      vi.stubEnv('TZ', 'Asia/Tokyo')
    })
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('runs in the zone it says it does', () => {
      // Tokyo midnight is 18:00 the day before in Finland; without this the cases below prove nothing.
      expect(new Date(2026, 8, 13).toISOString()).toBe('2026-09-12T15:00:00.000Z')
    })

    it('keeps a bare day key the day it names', () => {
      const firstDay = { resultsPublished: { ALO: [zonedParseDate('2026-09-12')] } }

      expect(isResultsPublishedForDay(firstDay, 'ALO', '2026-09-12')).toBe(true)
      expect(isResultsPublishedForDay(firstDay, 'ALO', '2026-09-13')).toBe(false)
    })

    it('opens a bare day key at its midnight in Finnish time', () => {
      expect(hasDayStarted('2026-09-13', new Date('2026-09-12T23:30:00+03:00'))).toBe(false)
      expect(hasDayStarted('2026-09-13', new Date('2026-09-13T00:00:00+03:00'))).toBe(true)
    })
  })

  describe('a classless two-day trial', () => {
    freezeClockAt('2026-09-27')

    const classless = {
      classes: [],
      endDate: new Date('2026-09-27'),
      resultsPublished: ['2026-09-26'],
      startDate: new Date('2026-09-26'),
      startListPublished: true,
      state: 'invited' as const,
    }

    it('shows the dog of the published day only', () => {
      expect(isResultsAvailableForRegistration(classless, { group: { date: new Date('2026-09-26') } })).toBe(true)
      expect(isResultsAvailableForRegistration(classless, { group: { date: new Date('2026-09-27') } })).toBe(false)
    })

    it('reads a dog without a day of its own as running on the first day', () => {
      const noDay = { group: {} }

      expect(isResultsAvailableForRegistration(classless, noDay)).toBe(true)
      expect(isResultsAvailableForRegistration({ ...classless, resultsPublished: ['2026-09-27'] }, noDay)).toBe(false)
    })

    it('lists the trial among those with results once a day is out', () => {
      expect(hasAvailableResults(classless)).toBe(true)
      expect(hasAvailableResults({ ...classless, resultsPublished: [] })).toBe(false)
    })
  })
})

/**
 * A trial whose date went by without its invitations going out has no flag; the panel and the public list
 * read that as unpublished and the panel offers the publish. The step must agree, not claim the list and
 * the numbers riding on it as published (KOE-1465).
 */
describe('the start list step in the progress', () => {
  const after = new Date('2026-09-20')

  it('waits on the publish of a past trial that never sent invitations', () => {
    const progress = getEventProgress(
      { ...eventWithStaticDates, startListPublished: undefined, state: 'picked' },
      after
    )

    expect(progress.publishedStartListClasses).toEqual([])
    expect(progress.startListActionable).toBe(true)
    expect(progress.startListCompleted).toBe(false)
    expect(progress.startNumbersCompleted).toBe(false)
  })

  it('still reads an absent flag as published for a trial the workflow invited', () => {
    const progress = getEventProgress(
      { ...eventWithStaticDates, startListPublished: undefined, state: 'invited' },
      after
    )

    expect(progress.publishedStartListClasses).toEqual(['NOU'])
    expect(progress.startListCompleted).toBe(true)
  })

  it('completes once the trial publishes its list', () => {
    const progress = getEventProgress({ ...eventWithStaticDates, startListPublished: true, state: 'picked' }, after)

    expect(progress.startListCompleted).toBe(true)
  })
})

describe('the results step in the progress', () => {
  const ended = {
    classes: [
      { class: 'ALO' as const, date: new Date('2026-09-12'), state: 'ended' as const },
      { class: 'AVO' as const, date: new Date('2026-09-12'), state: 'ended' as const },
    ],
    endDate: new Date('2026-09-12'),
    entryEndDate: new Date('2026-09-01'),
    entryStartDate: new Date('2026-08-01'),
    startDate: new Date('2026-09-12'),
    startListPublished: true,
    state: 'ended' as const,
  } as ConfirmedEvent

  const after = new Date('2026-09-20')

  it('stops at ended while any class is unpublished', () => {
    // No legacy default here: an event that never publishes simply never reaches the step.
    expect(getEventProgress(ended, after).phase).toBe('ended')
    expect(getEventProgress({ ...ended, resultsPublished: { ALO: true } }, after).phase).toBe('ended')
  })

  it('stops at ended while a class has only its first day published (KOE-1510)', () => {
    const twoDays = {
      ...ended,
      classes: [...ended.classes, { class: 'ALO' as const, date: new Date('2026-09-13'), state: 'ended' as const }],
      endDate: new Date('2026-09-13'),
      resultsPublished: { ALO: ['2026-09-12'], AVO: true },
    }

    expect(getEventProgress(twoDays, after).resultsCompleted).toBe(false)
    expect(getEventProgress({ ...twoDays, resultsPublished: { ALO: true, AVO: true } }, after).resultsCompleted).toBe(
      true
    )
  })

  it('reaches the results step once every class is published', () => {
    const published = { ...ended, resultsPublished: { ALO: true, AVO: true } }

    expect(getEventProgress(published, after).phase).toBe('resultsPublished')
    expect(getEventProgress(published, after).resultsCompleted).toBe(true)
  })
})

describe('isResultsAvailableForRegistration', () => {
  const event = {
    classes: [
      { class: 'ALO' as const, date: new Date('2026-09-12'), state: 'ended' as const },
      { class: 'AVO' as const, date: new Date('2026-09-12'), state: 'ended' as const },
    ],
    endDate: new Date('2026-09-12'),
    startDate: new Date('2026-09-12'),
    state: 'ended' as const,
  }
  const dog = (eventClass: string) => ({ class: eventClass, group: { date: new Date('2026-09-12') } })

  it('does not let a published start list carry an unpublished result out with it', () => {
    // The two gates are independent: a start list is public long before any result is.
    const published = { ...event, startListPublished: true }

    expect(isStartListAvailableForRegistration(published, dog('ALO'))).toBe(true)
    expect(isResultsAvailableForRegistration(published, dog('ALO'))).toBe(false)
  })

  it('shows a result only for the class that was published', () => {
    const partly = { ...event, resultsPublished: { ALO: true } }

    expect(isResultsAvailableForRegistration(partly, dog('ALO'))).toBe(true)
    expect(isResultsAvailableForRegistration(partly, dog('AVO'))).toBe(false)
  })

  describe('a picked two-day class opened after the trial (KOE-1509, KOE-1510)', () => {
    freezeClockAt('2026-09-20')

    // Its invitations never went out, so both entries stay 'picked'; the list was published on purpose.
    const picked = {
      classes: [
        { class: 'ALO' as const, date: new Date('2026-09-12'), state: 'picked' as const },
        { class: 'ALO' as const, date: new Date('2026-09-13'), state: 'picked' as const },
      ],
      endDate: new Date('2026-09-13'),
      resultsPublished: { ALO: ['2026-09-12'] },
      startDate: new Date('2026-09-12'),
      startListPublished: { ALO: true },
      state: 'picked' as const,
    }

    it('shows each day by its own publish', () => {
      expect(isResultsAvailableForRegistration(picked, { class: 'ALO', group: { date: new Date('2026-09-12') } })).toBe(
        true
      )
      expect(isResultsAvailableForRegistration(picked, { class: 'ALO', group: { date: new Date('2026-09-13') } })).toBe(
        false
      )
    })
  })

  describe('on the first day of a two-day trial (KOE-1510)', () => {
    freezeClockAt('2026-09-12')

    // The class states are the ones the workflow really writes: it never goes past 'invited', so the
    // calendar has the trial under way and only the flag can tell the two days apart.
    const twoDays = {
      classes: [
        { class: 'ALO' as const, date: new Date('2026-09-12'), state: 'invited' as const },
        { class: 'ALO' as const, date: new Date('2026-09-13'), state: 'invited' as const },
      ],
      endDate: new Date('2026-09-13'),
      startDate: new Date('2026-09-12'),
      startListPublished: true,
      state: 'invited' as const,
    }
    const firstDayDog = { class: 'ALO', group: { date: new Date('2026-09-12') } }
    const secondDayDog = { class: 'ALO', group: { date: new Date('2026-09-13') } }

    it('shows the first day only once that day is published', () => {
      const firstDay = { ...twoDays, resultsPublished: { ALO: ['2026-09-12'] } }

      expect(isResultsAvailableForRegistration(firstDay, firstDayDog)).toBe(true)
      // The second day is being scored now; its results wait for their own publish.
      expect(isResultsAvailableForRegistration(firstDay, secondDayDog)).toBe(false)
    })

    it('reads a day the JSON reviver turned into a date', () => {
      const revived = { ...twoDays, resultsPublished: { ALO: [new Date('2026-09-12')] } }

      expect(isResultsAvailableForRegistration(revived, firstDayDog)).toBe(true)
      expect(isResultsAvailableForRegistration(revived, secondDayDog)).toBe(false)
    })

    it('still reads a plain true as every day, so stored events keep their meaning', () => {
      const everyDay = { ...twoDays, resultsPublished: { ALO: true } }

      expect(isResultsAvailableForRegistration(everyDay, firstDayDog)).toBe(true)
      expect(isResultsAvailableForRegistration(everyDay, secondDayDog)).toBe(true)
    })
  })

  it('shows the results of a classless event once its one flag is on (KOE-1464)', () => {
    // A tolling aptitude trial (NOU) has no classes; its dogs carry no class either.
    const classless = {
      classes: [],
      endDate: new Date('2026-09-26'),
      startDate: new Date('2026-09-26'),
      startListPublished: true,
      state: 'ended' as const,
    }
    const noClassDog = { group: { date: new Date('2026-09-26') } }

    expect(isResultsAvailableForRegistration({ ...classless, resultsPublished: true }, noClassDog)).toBe(true)
    expect(isResultsAvailableForRegistration(classless, noClassDog)).toBe(false)
    expect(
      isResultsAvailableForRegistration({ ...classless, resultsPublished: true, startListPublished: false }, noClassDog)
    ).toBe(false)
  })
})

describe('isEventLive', () => {
  const now = new Date('2026-09-12T14:00:00+03:00')
  const running = [{ startedAt: new Date('2026-09-12T08:00:00+03:00') }]
  const yesterday = [
    { endedAt: new Date('2026-09-11T11:00:00+03:00'), startedAt: new Date('2026-09-11T08:00:00+03:00') },
  ]

  it('is live while a post is being run and the trial is not over', () => {
    expect(isEventLive({ classes: [{ class: 'ALO' }], liveTurns: running, resultsPublished: {} }, now)).toBe(true)
  })

  it('goes quiet with the day, and at once when every class has its results published', () => {
    expect(isEventLive({ classes: [{ class: 'ALO' }], liveTurns: yesterday, resultsPublished: {} }, now)).toBe(false)
    expect(isEventLive({ classes: [{ class: 'ALO' }], liveTurns: running, resultsPublished: { ALO: true } }, now)).toBe(
      false
    )
    expect(isEventLive({ classes: [], liveTurns: running, resultsPublished: true }, now)).toBe(false)
  })

  it('is quiet with nothing run', () => {
    expect(isEventLive({ classes: [{ class: 'ALO' }] }, now)).toBe(false)
  })

  describe('on a two-day trial published day by day (KOE-1510)', () => {
    const twoDays = {
      classes: [
        { class: 'ALO' as const, date: '2026-09-12' },
        { class: 'ALO' as const, date: '2026-09-13' },
      ],
      endDate: '2026-09-13',
      resultsPublished: { ALO: ['2026-09-12'] },
      startDate: '2026-09-12',
    }

    it('goes quiet once the day is published, though the next day is still to come', () => {
      const evening = new Date('2026-09-12T18:00:00+03:00')
      expect(isEventLive({ ...twoDays, liveTurns: running }, evening)).toBe(false)
    })

    it('lights up again with the turn of the next morning', () => {
      const sunday = new Date('2026-09-13T10:00:00+03:00')
      const sundayTurn = [{ startedAt: new Date('2026-09-13T08:00:00+03:00') }]
      expect(isEventLive({ ...twoDays, liveTurns: sundayTurn }, sunday)).toBe(true)
    })

    it('stays live while another class of the day is unpublished', () => {
      // AVO runs on Saturday too: ALO's day being out does not end the day.
      const withAvo = { ...twoDays, classes: [...twoDays.classes, { class: 'AVO' as const, date: '2026-09-12' }] }
      const evening = new Date('2026-09-12T18:00:00+03:00')

      expect(isEventLive({ ...withAvo, liveTurns: running }, evening)).toBe(true)
    })

    it('reads a classless event by its own day', () => {
      const classless = { classes: [], endDate: '2026-09-13', startDate: '2026-09-12' }
      expect(isEventLive({ ...classless, liveTurns: running, resultsPublished: ['2026-09-12'] }, now)).toBe(false)
      expect(isEventLive({ ...classless, liveTurns: running, resultsPublished: ['2026-09-13'] }, now)).toBe(true)
    })
  })
})

describe('getParticipantsPhase', () => {
  const classes = (...states: Array<EventClassState | undefined>) =>
    states.map((state, index): EventClass => ({ class: index ? 'AVO' : 'ALO', date: new Date(), state }))

  it('reads the event state where there are no classes', () => {
    expect(getParticipantsPhase({ classes: [], state: 'confirmed' })).toBeUndefined()
    expect(getParticipantsPhase({ classes: [], state: 'picked' })).toBe('picked')
    expect(getParticipantsPhase({ classes: [], state: 'invited' })).toBe('invited')
  })

  it('stays at the invitations once the trial itself has begun or ended', () => {
    expect(getParticipantsPhase({ classes: [], state: 'started' })).toBe('invited')
    expect(getParticipantsPhase({ classes: [], state: 'ended' })).toBe('invited')
    expect(getParticipantsPhase({ classes: [], state: 'completed' })).toBe('invited')
  })

  it('follows the class that is furthest behind, taking the event state for a class without one', () => {
    expect(getParticipantsPhase({ classes: classes('invited', 'picked'), state: 'picked' })).toBe('picked')
    expect(getParticipantsPhase({ classes: classes('invited', undefined), state: 'picked' })).toBe('picked')
    expect(getParticipantsPhase({ classes: classes('invited', 'invited'), state: 'confirmed' })).toBe('invited')
    expect(getParticipantsPhase({ classes: classes('picked', undefined), state: 'confirmed' })).toBeUndefined()
  })

  it('has nothing to say about an event that is not confirmed', () => {
    expect(getParticipantsPhase({ classes: classes('invited'), state: 'cancelled' })).toBeUndefined()
    expect(getParticipantsPhase({ classes: [], state: 'tentative' })).toBeUndefined()
  })
})

describe('isEntryEditingClosed', () => {
  const past = { endDate: new Date('2020-01-02'), startDate: new Date('2020-01-01') }
  const future = { endDate: new Date('2100-01-02'), startDate: new Date('2100-01-01') }

  it('closes once the trial day has gone', () => {
    expect(isEntryEditingClosed(past)).toBe(true)
    expect(isEntryEditingClosed(future)).toBe(false)
  })

  it('closes once the class has been judged, whatever the calendar says', () => {
    expect(isEntryEditingClosed(future, 'ended')).toBe(true)
    expect(isEntryEditingClosed(future, 'completed')).toBe(true)
  })

  it('stays open while the trial is still ahead of its results', () => {
    expect(isEntryEditingClosed(future, 'confirmed')).toBe(false)
    expect(isEntryEditingClosed(future, 'picked')).toBe(false)
    expect(isEntryEditingClosed(future, 'invited')).toBe(false)
    expect(isEntryEditingClosed(future, 'started')).toBe(false)
  })
})
