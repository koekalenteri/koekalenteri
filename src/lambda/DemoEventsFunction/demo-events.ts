import type { EventState, JsonEvent, JsonEventClass, RegistrationClass } from '../../types'

import { addMonths, addWeeks, startOfDay } from 'date-fns'

import { i18n } from '../../i18n/lambda'

const timestamp = new Date().toISOString()

const twoWeeksAgo = startOfDay(addWeeks(Date.now(), -2)).toISOString()
const oneWeekAgo = startOfDay(addWeeks(Date.now(), -1)).toISOString()
const today = startOfDay(new Date()).toISOString()
const oneWeekAway = startOfDay(addWeeks(Date.now(), 1)).toISOString()
const twoWeeksAway = startOfDay(addWeeks(Date.now(), 2)).toISOString()
const monthAway = startOfDay(addMonths(Date.now(), 1)).toISOString()

const draft: JsonEvent = {
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
  judges: [842408],
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

const dates: Pick<JsonEvent, 'startDate' | 'endDate' | 'entryStartDate' | 'entryEndDate' | 'name'>[] = [
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

export const events: JsonEvent[] = []

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
