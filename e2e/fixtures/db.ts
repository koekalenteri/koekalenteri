/**
 * The tests' own rows in the local DynamoDB. Every test writes what it needs under ids of its own
 * and never empties a table, so tests do not depend on each other's order or leftovers.
 */
import type { JsonConfirmedEvent, JsonDog, JsonRegistration, JsonUser, Organizer } from '../../src/types'
import { randomInt, randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DYNAMODB_ENDPOINT } from '../env.mjs'
import { endOfDay, helsinkiYear, startOfDay } from './dates'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    endpoint: DYNAMODB_ENDPOINT,
    region: 'eu-north-1',
  }),
  { marshallOptions: { removeUndefinedValues: true } }
)

/** The table names CustomDynamoClient derives from the template's logical ids. */
const TABLES = {
  dog: 'dog-table',
  event: 'event-table',
  organizer: 'organizer-table',
  registration: 'event-registration-table',
  user: 'user-table',
  userLink: 'user-link-table',
} as const

const putItem = (table: string, item: object) => client.send(new PutCommand({ Item: item, TableName: table }))

/** A short id that is unique across runs, readable in a trace. */
const uniqueId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

/**
 * A confirmed NOME-B trial whose entry is open today and which takes place in two weeks, with
 * whatever the test overrides. The name carries the id, so a test can find its own event among the
 * others on the page.
 */
export const seedEvent = async (overrides: Partial<JsonConfirmedEvent> = {}): Promise<JsonConfirmedEvent> => {
  const id = overrides.id ?? uniqueId('e2e')
  const startDate = overrides.startDate ?? startOfDay(14)
  const now = new Date().toISOString()
  const event: JsonConfirmedEvent & { season: string } = {
    classes: [{ class: 'ALO', date: startDate, places: 20 }],
    contactInfo: {
      official: { email: 'official@example.com', name: 'Teemu Toimitsija', phone: '040 123 4567' },
      secretary: { email: 'secretary@example.com', name: 'Siiri Sihteeri', phone: '040 765 4321' },
    },
    cost: 50,
    costMember: 40,
    createdAt: now,
    createdBy: 'e2e',
    description: 'Selaintestin koe',
    endDate: startDate,
    entries: 0,
    entryEndDate: endOfDay(7),
    entryStartDate: startOfDay(-1),
    eventType: 'NOME-B',
    headquarters: { address: 'Koetie 1', name: 'Kokoontumispaikka', postalDistrict: 'Tampere', zipCode: '33100' },
    id,
    judges: [{ id: 100002, name: 'Tuomari 1', official: true }],
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
    // The public list reads events through gsiSeasonStartDate; PutEvent derives the season the same way.
    season: helsinkiYear(overrides.startDate ?? startDate),
  }
  await putItem(TABLES.event, event)
  return event
}

/** An organizer with a Paytrail sub-merchant, which PaymentCreate requires before it starts a payment. */
export const seedOrganizer = async (overrides: Partial<Organizer> = {}): Promise<Organizer> => {
  const id = uniqueId('org')
  const organizer: Organizer = {
    active: true,
    id,
    name: `E2E-yhdistys ${id}`,
    paytrailMerchantId: '695874',
    ...overrides,
  }
  await putItem(TABLES.organizer, organizer)
  return organizer
}

/**
 * A two-year-old Labrador with no results, fetched from KLAPI "just now": GetDogFunction goes back
 * to KLAPI, which the tests cannot reach, only for a row older than an hour.
 */
export const seedDog = async (overrides: Partial<JsonDog> = {}): Promise<JsonDog> => {
  const number = randomInt(10000, 100000)
  const dog: JsonDog = {
    breedCode: '122',
    dam: { name: 'E2E Emä' },
    dob: startOfDay(-730),
    gender: 'F',
    name: `E2E Koira ${number}`,
    refreshDate: new Date().toISOString(),
    regNo: `FI${number}/24`,
    results: [],
    rfid: '246000000000000',
    sire: { name: 'E2E Isä' },
    titles: '',
    ...overrides,
  }
  await putItem(TABLES.dog, dog)
  return dog
}

/**
 * A user with a secretary role in the organizer. Outside prod the lambdas send mail only to staff
 * (KOE-1469), so an address that should receive a confirmation has to belong to one.
 */
export const seedStaffUser = async (overrides: Partial<JsonUser> = {}): Promise<JsonUser> => {
  const id = uniqueId('user')
  const now = new Date().toISOString()
  const user: JsonUser = {
    createdAt: now,
    createdBy: 'e2e',
    email: `${id}@example.com`,
    id,
    location: 'Tampere',
    modifiedAt: now,
    modifiedBy: 'e2e',
    name: `Olli Omistaja ${id}`,
    phone: '+358401234567',
    roles: { '1': 'secretary' },
    ...overrides,
  }
  await putItem(TABLES.user, user)
  return user
}

/** Maps a Cognito subject to a user, as the first login would. */
export const linkCognitoUser = (cognitoUser: string, userId: string) =>
  putItem(TABLES.userLink, { cognitoUser, userId })

/** A registration as the lambdas left it. */
export const readRegistration = async (eventId: string, id: string) =>
  (await client.send(new GetCommand({ Key: { eventId, id }, TableName: TABLES.registration }))).Item as
    | JsonRegistration
    | undefined

/**
 * The events of an organizer, whole. The index the admin list reads projects only some fields, so
 * it gives the ids and each event is read from the table.
 */
export const readEventsOf = async (organizerId: string) => {
  const { Items = [] } = await client.send(
    new QueryCommand({
      ExpressionAttributeValues: { ':organizerId': organizerId },
      IndexName: 'gsiOrganizerStartDate',
      KeyConditionExpression: 'organizerId = :organizerId',
      TableName: TABLES.event,
    })
  )
  const events = await Promise.all(
    Items.map(async ({ id }) => (await client.send(new GetCommand({ Key: { id }, TableName: TABLES.event }))).Item)
  )
  return events as JsonConfirmedEvent[]
}
