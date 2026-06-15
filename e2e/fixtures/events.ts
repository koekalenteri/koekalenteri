/**
 * Test fixtures for events
 */

import type { JsonConfirmedEvent, JsonEventClass, PublicJudge, PublicOrganizer } from 'src/types'

import { judges } from './judges'
import { users } from './users'

// Create references to judges for events
const mockJudges: PublicJudge[] = judges.map((j) => ({ id: j.id, name: j.name }))

// Find officials and secretaries from users
const findUserById = (userId: string) => {
  const user = users.find((u) => u.id === userId)

  if (!user) return { id: userId, name: 'user not fixtured' }

  const { id, name, email, phone } = user

  return { id, name, email, phone }
}

// Create references to officials and secretaries for events
const mockOfficials = [findUserById('official1'), findUserById('official2'), findUserById('official3')]
const mockSecretaries = [findUserById('user1'), findUserById('user2'), findUserById('admin1')]

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
  {
    class: 'ALO',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    judge: mockJudges[0],
    places: 20,
  },
  {
    class: 'AVO',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    judge: mockJudges[1],
    places: 15,
  },
  {
    class: 'VOI',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    judge: mockJudges[0],
    places: 15,
  },
]

const wtClasses: JsonEventClass[] = [
  { class: 'ALO', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), judge: mockJudges[2] },
  { class: 'AVO', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), judge: mockJudges[3] },
  { class: 'VOI', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), judge: mockJudges[2] },
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
    judges: [mockJudges[0], mockJudges[1]],
    classes: nomeClasses,
    cost: 35.0,
    places: 50,
    entries: 0,
    state: 'confirmed',
    costMember: 0,
    official: mockOfficials[0],
    secretary: mockSecretaries[0],
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
    judges: [mockJudges[2], mockJudges[3]],
    classes: wtClasses,
    cost: 45.0,
    costMember: 40.0,
    places: 30,
    entries: 0,
    state: 'confirmed',
    official: mockOfficials[1],
    secretary: mockSecretaries[1],
    createdAt: '',
    createdBy: '',
    modifiedAt: '',
    modifiedBy: '',
  },
]
