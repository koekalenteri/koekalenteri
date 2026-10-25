import i18n from 'i18next'
import { buildEventClassStats, eventClassStatsSpreadsheetRows, isEventInClassStats } from './eventClassStats'

type StatsEvent = Parameters<typeof buildEventClassStats>[0]
type StatsRegistration = Parameters<typeof buildEventClassStats>[1][number]

const event: StatsEvent = {
  classes: [
    { class: 'ALO', date: '2024-06-01', places: 10 },
    { class: 'ALO', date: '2024-06-02', places: 8 },
    { class: 'AVO', date: '2024-06-02', places: 6 },
  ],
  cost: { normal: 50 },
  costMember: 40,
  endDate: '2024-06-02',
  entryEndDate: '2024-05-15',
  entryStartDate: '2024-05-01',
  eventType: 'NOME-B',
  location: 'Somewhere',
  organizer: { id: 'org-1' },
  places: 24,
  priority: ['member', '110'],
  startDate: '2024-06-01',
  state: 'completed',
}

const registration = (patch: Partial<StatsRegistration>): StatsRegistration => ({
  cancelled: false,
  class: 'ALO',
  dog: { breedCode: '122' },
  group: { key: 'reserve', number: 1 },
  state: 'ready',
  ...patch,
})

const starter: Pick<StatsRegistration, 'group'> = {
  group: { date: '2024-06-01', key: '2024-06-01-ap', number: 1, time: 'ap' },
}

describe('buildEventClassStats', () => {
  it('gives one row per class, listing the days it runs on and summing their places', () => {
    const rows = buildEventClassStats(event, [])

    expect(rows).toEqual([
      expect.objectContaining({
        class: 'ALO',
        cost: 50,
        costMember: 40,
        days: ['2024-06-01', '2024-06-02'],
        endDate: '2024-06-02',
        entryEndDate: '2024-05-15',
        entryStartDate: '2024-05-01',
        eventType: 'NOME-B',
        location: 'Somewhere',
        organizerId: 'org-1',
        places: 18,
        priority: ['member', '110'],
        startDate: '2024-06-01',
      }),
      expect.objectContaining({ class: 'AVO', days: ['2024-06-02'], places: 6 }),
    ])
  })

  it('leaves the member fee unset and the priorities empty for a trial that has neither', () => {
    const [alo] = buildEventClassStats({ ...event, costMember: undefined, priority: undefined }, [])

    expect(alo.costMember).toBeUndefined()
    expect(alo.priority).toEqual([])
  })

  it('counts the entries of a class without naming anyone', () => {
    const registrations = [
      registration({ ...starter, paidAmount: 50 }),
      registration({ ...starter, dog: { breedCode: '110' }, paidAmount: 50 }),
      registration({ cancelled: true, paidAmount: 50, refundAmount: 45 }),
      registration({ paidAmount: 50 }),
      // An entry left unfinished in the payment step is no entry.
      registration({ state: 'creating' }),
      registration({ class: 'AVO', ...starter, paidAmount: 40 }),
    ]

    const [alo, avo] = buildEventClassStats(event, registrations)

    expect(alo).toEqual(
      expect.objectContaining({
        cancelled: 1,
        entries: 4,
        paidAmount: 200,
        priorityEntries: 1,
        refundedAmount: 45,
      })
    )
    expect(avo).toEqual(expect.objectContaining({ cancelled: 0, entries: 1, paidAmount: 40, priorityEntries: 0 }))
    // Aggregates only: nothing that names a dog, a person or an entry.
    expect(Object.keys(alo).sort()).toEqual([
      'cancelled',
      'class',
      'cost',
      'costMember',
      'days',
      'endDate',
      'entries',
      'entryEndDate',
      'entryStartDate',
      'eventType',
      'location',
      'organizerId',
      'paidAmount',
      'pickedFromReserve',
      'places',
      'priority',
      'priorityEntries',
      'refundedAmount',
      'startDate',
      'state',
    ])
  })

  it('counts the dogs picked from the reserve list, also those that cancelled after', () => {
    const registrations = [
      // Told it was on the reserve list, and now starts: picked from reserve (also rows before 2025,
      // which have no messagesSent).
      registration({ ...starter, reserveNotified: 2 }),
      registration({ ...starter, reserveNotified: true }),
      // Picked from reserve, then cancelled: the 'picked' message says it was picked.
      registration({ cancelled: true, messagesSent: { picked: true, reserve: true }, reserveNotified: 1 }),
      // Told it was on the reserve list and never got a place.
      registration({ reserveNotified: 3 }),
      registration({ cancelled: true, messagesSent: { reserve: true }, reserveNotified: 4 }),
      // Picked in the first selection, never on the reserve list.
      registration({ ...starter, messagesSent: { picked: true } }),
    ]

    const [alo] = buildEventClassStats(event, registrations)

    expect(alo.pickedFromReserve).toBe(3)
  })

  it('keeps a class the event no longer runs as a row of its own, and a classless trial as one row', () => {
    const classless: StatsEvent = {
      ...event,
      classes: [],
      eventType: 'NOWT',
      places: 30,
    }

    expect(buildEventClassStats(classless, [registration({ class: null, ...starter })])).toEqual([
      expect.objectContaining({ class: '', days: ['2024-06-01', '2024-06-02'], entries: 1, places: 30 }),
    ])

    const rows = buildEventClassStats(event, [registration({ class: 'VOI' }), registration({ class: null })])
    expect(rows.map((row) => [row.class, row.days, row.places, row.entries])).toEqual([
      ['ALO', ['2024-06-01', '2024-06-02'], 18, 0],
      ['AVO', ['2024-06-02'], 6, 0],
      ['VOI', [], 0, 1],
      // An entry without a class on a trial with classes is kept too, not dropped.
      ['', [], 0, 1],
    ])
  })
})

describe('isEventInClassStats', () => {
  it.each([
    [{ state: 'draft' as const }, false],
    [{ state: 'cancelled' as const }, false],
    [{ deletedAt: '2024-05-01T10:00:00.000Z', state: 'confirmed' as const }, false],
    [{ state: 'tentative' as const }, true],
    [{ state: 'confirmed' as const }, true],
    [{ state: 'completed' as const }, true],
  ])('%o is in the export: %s', (event, expected) => {
    expect(isEventInClassStats(event)).toBe(expected)
  })
})

describe('eventClassStatsSpreadsheetRows', () => {
  // The real translations, so a missing key in the sheet's header fails here.
  const namespaces: ['translation', 'breed'] = ['translation', 'breed']
  const t = i18n.getFixedT('fi', namespaces)

  it('orders the rows by start day, organizer, event type and class, and leaves an unset value empty', () => {
    const [alo, avo] = buildEventClassStats(event, [])
    const later = { ...alo, organizerId: 'org-0', startDate: '2024-07-01' as const }
    const otherClub = { ...avo, costMember: undefined, entryStartDate: undefined, organizerId: 'org-2' }
    // Same day, club and place as `alo`: only the event type decides, and NOME-A sorts before NOME-B.
    const otherType = { ...avo, eventType: 'NOME-A' }

    const [header, ...rows] = eventClassStatsSpreadsheetRows(
      [later, otherClub, avo, alo, otherType],
      t,
      (id) => `Club ${id}`
    )

    expect(header).toHaveLength(20)
    expect(header.slice(0, 2)).toEqual(['Yhdistys', 'Paikkakunta'])
    expect(rows.map((row) => [row[0], row[2], row[4], row[11]])).toEqual([
      ['Club org-1', '2024-06-01', 'NOME-A', 'AVO'],
      ['Club org-1', '2024-06-01', 'NOME-B', 'ALO'],
      ['Club org-1', '2024-06-01', 'NOME-B', 'AVO'],
      ['Club org-2', '2024-06-01', 'NOME-B', 'AVO'],
      ['Club org-0', '2024-07-01', 'NOME-B', 'ALO'],
    ])
    expect(rows[1][5]).toBe(t('event.states.completed'))
    expect(rows[1][8]).toBe(`${t('priority.members')}, ${t('breed:110')}`)
    expect(rows[3][6]).toBeUndefined()
    expect(rows[3][10]).toBeUndefined()
  })
})
