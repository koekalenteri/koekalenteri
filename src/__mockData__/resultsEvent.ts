import type { ConfirmedEvent, Registration } from '../types'
import { parseISO } from 'date-fns'
import { zonedStartOfDay } from '../i18n/dates'
import { emptyEvent } from './emptyEvent'
import { registrationWithStaticDates } from './registrations'

const RESULTS_EVENT_DAY = zonedStartOfDay(parseISO('2021-02-10T12:00:00Z'))

/**
 * A working test with a course to score against: two posts, one splitting its 20 points into two
 * tasks, so a round covers three slots and the layout exercises both shapes.
 */
export const eventWithStations: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: RESULTS_EVENT_DAY },
    { class: 'AVO', date: RESULTS_EVENT_DAY },
  ],
  endDate: RESULTS_EVENT_DAY,
  entryEndDate: zonedStartOfDay(parseISO('2021-02-07T12:00:00Z')),
  entryStartDate: zonedStartOfDay(parseISO('2021-02-01T12:00:00Z')),
  eventType: 'NOWT',
  id: 'test-results',
  judges: [{ id: 223, name: 'Tuomari 2' }],
  name: 'Tuloskoe',
  startDate: RESULTS_EVENT_DAY,
  stations: [
    { date: RESULTS_EVENT_DAY, id: 'post-1', judges: [{ id: 223, name: 'Tuomari 2' }], number: 1, tasks: 1 },
    { date: RESULTS_EVENT_DAY, id: 'post-2', number: 2, tasks: 2 },
  ],
}

const entry = (id: string, name: string, overrides: Partial<Registration> = {}): Registration => ({
  ...registrationWithStaticDates,
  class: 'ALO',
  dog: { ...registrationWithStaticDates.dog, name, regNo: `REG-${id}` },
  eventId: eventWithStations.id,
  eventType: 'NOWT',
  handler: {
    email: 'handler@e.mail',
    location: 'handler location',
    membership: false,
    name: `${name} ohjaaja`,
    phone: 'phone',
  },
  id,
  ...overrides,
})

/**
 * Two dogs that ran and one reserve that did not, so a test can tell "everyone entered" from "everyone
 * who actually has a round to score".
 */
export const registrationsToEventWithStations: Registration[] = [
  entry('run-1', 'Ensimmainen', { group: { date: RESULTS_EVENT_DAY, key: 'ALO-AP', number: 1, time: 'ap' } }),
  entry('run-2', 'Toinen', { group: { date: RESULTS_EVENT_DAY, key: 'ALO-AP', number: 2, time: 'ap' } }),
  entry('reserve-1', 'Varalla', { group: { key: 'reserve', number: 1 } }),
]
