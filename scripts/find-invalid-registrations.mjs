#!/usr/bin/env node

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const ARRAY_FIELDS = [
  { path: ['dates'], required: true },
  { path: ['dog', 'results'], required: false },
  { path: ['optionalCosts'], required: false },
  { path: ['qualifyingResults'], required: true },
  { path: ['results'], required: false },
]

const usage = `Usage:
  npm run find-invalid-registrations -- --stack <stack-name-or-stage> [--season <year>]
  npm run find-invalid-registrations -- --table <registration-table> --event-table <event-table>
      [--season <year>] [--include-deleted]
  npm run find-invalid-registrations -- --table <registration-table> --event <event-id>

Tables can also be supplied with REGISTRATION_TABLE_NAME and EVENT_TABLE_NAME.
With --stack, values such as dev and koekalenteri-dev both resolve to the koekalenteri-dev stack.
The season defaults to the current year in Europe/Helsinki.
AWS credentials, profile and region are resolved by the standard AWS SDK credential chain.`

const currentSeason = () =>
  new Intl.DateTimeFormat('en', { timeZone: 'Europe/Helsinki', year: 'numeric' }).format(new Date())

const parseArgs = (args) => {
  const options = {
    includeDeleted: false,
    eventTable: process.env.EVENT_TABLE_NAME,
    season: currentSeason(),
    table: process.env.REGISTRATION_TABLE_NAME,
  }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--include-deleted') {
      options.includeDeleted = true
      continue
    }
    if (
      argument === '--event' ||
      argument === '--event-table' ||
      argument === '--season' ||
      argument === '--stack' ||
      argument === '--table'
    ) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
      if (argument === '--event') options.eventId = value
      else if (argument === '--event-table') options.eventTable = value
      else if (argument === '--season') options.season = value
      else if (argument === '--stack') options.stack = value
      else options.table = value
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

const fieldValue = (registration, path) => {
  let value = registration
  for (const field of path) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, field)) {
      return { exists: false, value: undefined }
    }
    value = value[field]
  }
  return { exists: true, value }
}

export const invalidRegistrationArrayFields = (registration) =>
  Object.fromEntries(
    ARRAY_FIELDS.flatMap(({ path, required }) => {
      const field = fieldValue(registration, path)
      if ((!field.exists && !required) || (field.exists && Array.isArray(field.value))) return []
      return [[path.join('.'), field.exists ? field.value : { missing: true }]]
    })
  )

const queryAll = async (client, input) => {
  const items = []
  let exclusiveStartKey

  do {
    const response = await client.send(new QueryCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }))
    items.push(...(response.Items ?? []))
    exclusiveStartKey = response.LastEvaluatedKey
  } while (exclusiveStartKey)

  return items
}

export const getSeasonEventIds = async ({ client, eventTable, season }) => {
  const events = await queryAll(client, {
    ExpressionAttributeNames: { '#id': 'id', '#season': 'season' },
    ExpressionAttributeValues: { ':season': season },
    IndexName: 'gsiSeasonStartDate',
    KeyConditionExpression: '#season = :season',
    ProjectionExpression: '#id',
    TableName: eventTable,
  })
  return events.flatMap((event) => (typeof event.id === 'string' ? [event.id] : []))
}

export const findInvalidRegistrations = async ({ client, eventIds, includeDeleted, table }) => {
  const registrations = []

  for (const eventId of eventIds) {
    const items = await queryAll(client, {
      ExpressionAttributeNames: {
        '#dates': 'dates',
        '#deletedAt': 'deletedAt',
        '#dog': 'dog',
        '#dogResults': 'results',
        '#eventId': 'eventId',
        '#id': 'id',
        '#modifiedAt': 'modifiedAt',
        '#optionalCosts': 'optionalCosts',
        '#qualifyingResults': 'qualifyingResults',
        '#results': 'results',
      },
      ExpressionAttributeValues: { ':eventId': eventId },
      KeyConditionExpression: '#eventId = :eventId',
      ProjectionExpression:
        '#eventId, #id, #modifiedAt, #deletedAt, #dates, #dog.#dogResults, #optionalCosts, #qualifyingResults, #results',
      TableName: table,
    })

    for (const registration of items) {
      if (!includeDeleted && registration.deletedAt) continue

      const invalidFields = invalidRegistrationArrayFields(registration)
      if (Object.keys(invalidFields).length === 0) continue
      registrations.push({
        eventId: registration.eventId,
        id: registration.id,
        invalidFields,
        modifiedAt: registration.modifiedAt,
      })
    }
  }

  return registrations
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage)
    return
  }
  if (options.stack) {
    const stackName = options.stack.startsWith('koekalenteri-') ? options.stack : `koekalenteri-${options.stack}`
    options.table ??= `event-registration-table-${stackName}`
    options.eventTable ??= `event-table-v3-${stackName}`
  }
  if (!options.table) throw new Error(`Registration table is required.\n\n${usage}`)
  if (!options.eventId && !options.eventTable) throw new Error(`Event table is required.\n\n${usage}`)

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
  console.error(`Registration table: ${options.table}`)
  if (!options.eventId) console.error(`Event table: ${options.eventTable}; season: ${options.season}`)
  const eventIds = options.eventId
    ? [options.eventId]
    : await getSeasonEventIds({ client, eventTable: options.eventTable, season: options.season })
  const registrations = await findInvalidRegistrations({ client, eventIds, ...options })
  console.log(JSON.stringify(registrations, null, 2))
  console.error(
    `Found ${registrations.length} invalid registration(s) across ${eventIds.length} event(s) in season ${options.season}.`
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
