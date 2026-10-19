/**
 * The event the browser tests register to, as a row of the event table. One shape for both suites:
 * the local one writes it into DynamoDB-local (`fixtures/db.ts`), the one against the test
 * environment into that stack's table (`remote/global-setup.ts`).
 */
import type { JsonConfirmedEvent } from '../../src/types'
import { randomUUID } from 'node:crypto'
import { helsinkiDay, helsinkiYear } from './dates'

/** An event row with the keys PutEvent derives, which the indexes are built on. */
export type EventRow = JsonConfirmedEvent & { organizerId: string; season: string }

/** A short id that is unique across runs, readable in a trace. */
export const uniqueId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

/**
 * A confirmed NOME-B trial whose entry is open today and which takes place in two weeks, with
 * whatever the test overrides. The name carries the id, so a test can find its own event among the
 * others on the page.
 */
export const buildEvent = (overrides: Partial<JsonConfirmedEvent> = {}): EventRow => {
  const id = overrides.id ?? uniqueId('e2e')
  const startDate = overrides.startDate ?? helsinkiDay(14)
  const now = new Date().toISOString()
  return {
    classes: [{ class: 'ALO', date: startDate, places: 20 }],
    contactInfo: {
      official: { email: 'official@example.com', name: 'Teemu Toimitsija', phone: '040 123 4567' },
      secretary: { email: 'secretary@example.com', name: 'Siiri Sihteeri', phone: '040 765 4321' },
    },
    cost: 50,
    costMember: 40,
    createdAt: now,
    createdBy: 'e2e',
    dates: [
      { date: startDate, time: 'ap' },
      { date: startDate, time: 'ip' },
    ],
    description: 'Selaintestin koe',
    endDate: startDate,
    entries: 0,
    entryEndDate: helsinkiDay(7),
    entryStartDate: helsinkiDay(-1),
    eventType: 'NOME-B',
    headquarters: { address: 'Koetie 1', name: 'Kokoontumispaikka', postalDistrict: 'Tampere', zipCode: '33100' },
    id,
    judges: [{ id: 100002, name: 'Tuomari 1', official: true }],
    kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
    kcId: 1234567,
    location: `E2E-paikka ${id}`,
    modifiedAt: now,
    modifiedBy: 'e2e',
    name: `E2E-koe ${id}`,
    official: { id: '1', name: 'Teemu Toimitsija' },
    organizer: { id: '1', name: 'Suomen Noutajakoirajärjestö ry' },
    places: 20,
    priority: ['member'],
    secretary: { id: '2', name: 'Siiri Sihteeri' },
    startDate,
    state: 'confirmed',
    ...overrides,
    // The keys PutEvent derives: the public list reads events through gsiSeasonStartDate, the
    // organizer's admin list through gsiOrganizerStartDate.
    organizerId: overrides.organizer?.id ?? '1',
    season: helsinkiYear(overrides.startDate ?? startDate),
  }
}
