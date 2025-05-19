/**
 * Test fixtures for events
 */

import type { JsonConfirmedEvent, JsonEventClass, PublicJudge, PublicOrganizer } from 'src/types'

// Create mock judges
const judges: PublicJudge[] = [
  { id: 1, name: 'Judge One' },
  { id: 2, name: 'Judge Two' },
  { id: 3, name: 'Judge Three' },
  { id: 4, name: 'Judge Four' },
]

// Create mock organizer
const organizer: PublicOrganizer = {
  id: 'test-org-1',
  name: 'Test Organizer',
}

const organizer2: PublicOrganizer = {
  id: 'test-org-2',
  name: 'Test Organizer 2',
}

// Create mock event classes
const nomeClasses: JsonEventClass[] = [
  { class: 'ALO', date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), judge: judges[0] },
  { class: 'AVO', date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), judge: judges[1] },
  { class: 'VOI', date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), judge: judges[0] },
]

const wtClasses: JsonEventClass[] = [
  { class: 'ALO', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), judge: judges[2] },
  { class: 'AVO', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), judge: judges[3] },
  { class: 'VOI', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), judge: judges[2] },
]

export const events: JsonConfirmedEvent[] = [
  {
    id: 'test-event-1',
    name: 'Test NOME-B Competition',
    description: 'A test NOME-B competition for dogs',
    location: 'Test Location',
    startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    entryStartDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    entryEndDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    eventType: 'NOME-B',
    organizer,
    judges: [judges[0], judges[1]],
    classes: nomeClasses,
    cost: 35.0,
    places: 50,
    entries: 25,
    state: 'confirmed',
    costMember: 0,
    official: {},
    secretary: {},
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago,
    createdBy: 'test',
    modifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago,,
    modifiedBy: 'test',
  },
  {
    id: 'test-event-2',
    name: 'Test NOWT Competition',
    description: 'A test NOWT competition for dogs',
    location: 'Another Test Location',
    startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
    entryStartDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    entryEndDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
    eventType: 'NOWT',
    organizer: organizer2,
    judges: [judges[2], judges[3]],
    classes: wtClasses,
    cost: 45.0,
    costMember: 40.0,
    places: 30,
    entries: 15,
    state: 'confirmed',
    official: {},
    secretary: {},
    createdAt: '',
    createdBy: '',
    modifiedAt: '',
    modifiedBy: '',
  },
]
