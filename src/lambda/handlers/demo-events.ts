import type { EventState, JsonDogEvent, JsonEventClass, RegistrationClass } from '../../types'

import { addMonths, addWeeks } from 'date-fns'

import { zonedStartOfDay } from '../../i18n/dates'
import { i18n } from '../../i18n/lambda'

const timestamp = new Date().toISOString()

const twoWeeksAgo = zonedStartOfDay(addWeeks(Date.now(), -2)).toISOString()
const oneWeekAgo = zonedStartOfDay(addWeeks(Date.now(), -1)).toISOString()
const today = zonedStartOfDay(new Date()).toISOString()
const oneWeekAway = zonedStartOfDay(addWeeks(Date.now(), 1)).toISOString()
const twoWeeksAway = zonedStartOfDay(addWeeks(Date.now(), 2)).toISOString()
const monthAway = zonedStartOfDay(addMonths(Date.now(), 1)).toISOString()

const draft: JsonDogEvent = {
  classes: [],
  contactInfo: {
    secretary: {
      email: 'secretary@example.com',
    },
    official: {
      email: 'official@example.com',
    },
  },
  cost: 50,
  costMember: 40,
  createdAt: timestamp,
  createdBy: 'cron',
  description: 'Joka yö automaattisesti uudelleengeneroitava tapahtuma',
  endDate: monthAway,
  eventType: 'NOME-A',
  id: 'demo-draft-nome-a',
  judges: [{ id: 842408, name: 'Fontell Ari-Pekka', official: true }],
  location: 'demo',
  modifiedAt: timestamp,
  modifiedBy: 'cron',
  name: 'DEMO: Luonnos NOME-A +1kk',
  official: {
    id: '0',
    name: 'Demo Koevastaava',
  },
  organizer: {
    id: 'sZty-anoPN',
    name: 'SUOMEN NOUTAJAKOIRAJÄRJESTÖ R.Y.',
  },
  places: 0,
  secretary: {
    id: 'demo-sihteeri',
    name: 'Demo Sihteeri',
  },
  startDate: monthAway,
  state: 'draft',
}

const dates: Pick<JsonDogEvent, 'startDate' | 'endDate' | 'entryStartDate' | 'entryEndDate' | 'name'>[] = [
  {
    startDate: monthAway,
    endDate: monthAway,
    entryStartDate: oneWeekAway,
    entryEndDate: twoWeeksAway,
    name: '+1kk',
  },
  {
    startDate: twoWeeksAway,
    endDate: twoWeeksAway,
    entryStartDate: today,
    entryEndDate: oneWeekAway,
    name: '+2vk (ilmoaika tänään->)',
  },
  {
    startDate: twoWeeksAway,
    endDate: twoWeeksAway,
    entryStartDate: oneWeekAgo,
    entryEndDate: today,
    name: '+2vk (ilmoaika ->tänään',
  },
  {
    startDate: today,
    endDate: today,
    entryStartDate: twoWeeksAgo,
    entryEndDate: oneWeekAgo,
    name: 'tänään',
  },
]

const states: EventState[] = ['draft', 'tentative', 'cancelled', 'confirmed']
const types: string[] = ['NOU', 'NOME-B', 'NOWT', 'NOME-A', 'NKM']
const t = i18n.getFixedT('fi')

export const events: JsonDogEvent[] = []

const registrationClasses: RegistrationClass[] = ['ALO', 'AVO', 'VOI']

const getClasses = (eventType: string, date: string): JsonEventClass[] => {
  if (!['NOME-B', 'NOWT'].includes(eventType)) return []

  return registrationClasses.map((c) => ({ class: c, date, places: 10 }))
}

for (const date of dates) {
  for (const state of states) {
    const stateName = t(`event.states.${state}`)
    for (const eventType of types) {
      events.push({
        ...draft,
        id: `demo-${eventType}-${state}-${date.name}`,
        ...date,
        classes: getClasses(eventType, date.startDate),
        eventType,
        state,
        name: `DEMO: ${eventType} ${date.name} [${stateName}]`,
        places: 30,
      })
    }
  }
}
