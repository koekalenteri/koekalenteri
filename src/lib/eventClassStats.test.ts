import type { JsonRegistration } from '../types'
import { buildEventClassStats } from './eventClassStats'

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
  id: 'event-1',
  location: 'Somewhere',
  organizer: { id: 'org-1', name: 'Club' },
  places: 24,
  priority: ['member', '110'],
  startDate: '2024-06-01',
  state: 'completed',
}

const registration = (patch: Partial<JsonRegistration>): StatsRegistration => ({
  cancelled: false,
  class: 'ALO',
  dog: { breedCode: '122' },
  eventId: 'event-1',
  eventType: 'NOME-B',
  group: { key: 'reserve', number: 1 },
  id: `reg-${Math.random()}`,
  state: 'ready',
  ...patch,
})

const starter = { group: { date: '2024-06-01', key: '2024-06-01-ap', number: 1, time: 'ap' as const } }

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
        eventPlaces: 24,
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
        reserve: 1,
        starters: 2,
      })
    )
    expect(avo).toEqual(expect.objectContaining({ entries: 1, paidAmount: 40, starters: 1 }))
    for (const row of [alo, avo]) {
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['id', 'regNo', 'name', 'email', 'registrationIds']))
    }
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

    expect(buildEventClassStats(classless, [registration({ class: null, eventType: 'NOWT', ...starter })])).toEqual([
      expect.objectContaining({ class: '', days: ['2024-06-01', '2024-06-02'], entries: 1, places: 30, starters: 1 }),
    ])

    const rows = buildEventClassStats(event, [registration({ class: 'VOI' })])
    expect(rows.map((row) => [row.class, row.days, row.places, row.entries])).toEqual([
      ['ALO', ['2024-06-01', '2024-06-02'], 18, 0],
      ['AVO', ['2024-06-02'], 6, 0],
      ['VOI', [], 0, 1],
    ])
  })
})
