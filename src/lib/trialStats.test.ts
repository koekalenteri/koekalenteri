import type { TFunction } from 'i18next'
import type { TrialStatsEntry } from '../types/Stats'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_TRIALS } from '../types/Stats'
import { buildTrialStatsTable, trialStatsSpreadsheetRows } from './trialStats'

const t = ((key: string) =>
  ({
    organization: 'Organization',
    'stats.admin.eventType': 'Event type',
    'stats.admin.trialStatsCancelled': 'Cancelled',
    'stats.admin.trialStatsEvents': 'Trials',
    'stats.admin.trialStatsHandlers': 'Handlers',
    'stats.admin.trialStatsMembers': 'Members',
    'stats.admin.trialStatsPlaces': 'Places',
    'stats.admin.trialStatsReserve': 'Reserve',
    'stats.admin.trialStatsStarters': 'Starts',
    'stats.admin.trialStatsTotal': 'Total',
  })[key] ?? key) as TFunction

const organizerName = (organizerId: string) => ({ '1': 'Club One', '2': 'Club Two' })[organizerId] ?? organizerId

describe('buildTrialStatsTable', () => {
  it('groups rows by club, sorted by name, each followed by its own subtotal', () => {
    const entries: TrialStatsEntry[] = [
      { eventCount: 5, eventType: 'NOU', handlerCount: 40, organizerId: '2', places: 100, starters: 90 },
      {
        eventCount: 5,
        eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
        handlerCount: 40,
        organizerId: '2',
        places: 100,
        starters: 90,
      },
      { eventCount: 2, eventType: 'NOME-B', handlerCount: 10, organizerId: '1', places: 20, starters: 15 },
      { eventCount: 1, eventType: 'NOU', handlerCount: 5, organizerId: '1', places: 10, starters: 8 },
      {
        eventCount: 3,
        eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
        handlerCount: 12,
        organizerId: '1',
        places: 30,
        starters: 23,
      },
      {
        eventCount: 8,
        eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
        handlerCount: 50,
        organizerId: ALL_ORGANIZERS_FOR_TRIALS,
        places: 130,
        starters: 113,
      },
    ]

    const { grandTotal, rows } = buildTrialStatsTable(entries, organizerName)

    // Club One sorts before Club Two; within a club, event types sort alphabetically; each
    // club's own rows are immediately followed by that club's subtotal.
    expect(rows.map((row) => [row.organizerName, row.eventType, row.isSubtotal])).toEqual([
      ['Club One', 'NOME-B', false],
      ['Club One', 'NOU', false],
      ['Club One', ALL_EVENT_TYPES_FOR_CAPACITY, true],
      ['Club Two', 'NOU', false],
      ['Club Two', ALL_EVENT_TYPES_FOR_CAPACITY, true],
    ])
    expect(grandTotal).toEqual(expect.objectContaining({ eventCount: 8, handlerCount: 50, places: 130, starters: 113 }))
  })

  it('omits a club subtotal or the grand total when the data has none', () => {
    const entries: TrialStatsEntry[] = [
      { eventCount: 1, eventType: 'NOU', handlerCount: 5, organizerId: '1', places: 10, starters: 8 },
    ]

    const { grandTotal, rows } = buildTrialStatsTable(entries, organizerName)

    expect(rows).toEqual([expect.objectContaining({ isSubtotal: false, organizerName: 'Club One' })])
    expect(grandTotal).toBeUndefined()
  })

  it('falls back to the raw id for a club with no known name', () => {
    const entries: TrialStatsEntry[] = [
      { eventCount: 1, eventType: 'NOU', handlerCount: 1, organizerId: 'deleted-org', places: 5, starters: 1 },
    ]

    const { rows } = buildTrialStatsTable(entries, organizerName)

    expect(rows[0].organizerName).toBe('deleted-org')
  })
})

describe('trialStatsSpreadsheetRows', () => {
  it('builds a header row, one row per table row, and a trailing grand total row', () => {
    const entries: TrialStatsEntry[] = [
      {
        cancelledRegistrations: 1,
        eventCount: 1,
        eventType: 'NOU',
        handlerCount: 5,
        memberStarters: 3,
        organizerId: '1',
        places: 10,
        reserve: 2,
        starters: 8,
      },
      {
        cancelledRegistrations: 1,
        eventCount: 1,
        eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
        handlerCount: 5,
        memberStarters: 3,
        organizerId: '1',
        places: 10,
        reserve: 2,
        starters: 8,
      },
      {
        cancelledRegistrations: 1,
        eventCount: 1,
        eventType: ALL_EVENT_TYPES_FOR_CAPACITY,
        handlerCount: 5,
        memberStarters: 3,
        organizerId: ALL_ORGANIZERS_FOR_TRIALS,
        places: 10,
        reserve: 2,
        starters: 8,
      },
    ]
    const { grandTotal, rows } = buildTrialStatsTable(entries, organizerName)

    expect(trialStatsSpreadsheetRows(rows, grandTotal, t)).toEqual([
      ['Organization', 'Event type', 'Trials', 'Places', 'Starts', 'Handlers', 'Reserve', 'Cancelled', 'Members'],
      ['Club One', 'NOU', 1, 10, 8, 5, 2, 1, 3],
      ['Club One', 'Total', 1, 10, 8, 5, 2, 1, 3],
      ['Total', '', 1, 10, 8, 5, 2, 1, 3],
    ])
  })

  it('defaults the new optional columns to zero when absent from an entry', () => {
    const entries: TrialStatsEntry[] = [
      { eventCount: 1, eventType: 'NOU', handlerCount: 5, organizerId: '1', places: 10, starters: 8 },
    ]
    const { grandTotal, rows } = buildTrialStatsTable(entries, organizerName)

    expect(trialStatsSpreadsheetRows(rows, grandTotal, t)).toEqual([
      ['Organization', 'Event type', 'Trials', 'Places', 'Starts', 'Handlers', 'Reserve', 'Cancelled', 'Members'],
      ['Club One', 'NOU', 1, 10, 8, 5, 0, 0, 0],
    ])
  })

  it('omits the trailing total row when there is no grand total', () => {
    expect(trialStatsSpreadsheetRows([], undefined, t)).toEqual([
      ['Organization', 'Event type', 'Trials', 'Places', 'Starts', 'Handlers', 'Reserve', 'Cancelled', 'Members'],
    ])
  })
})
