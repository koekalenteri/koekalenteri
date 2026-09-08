#!/usr/bin/env node
/**
 * Creates the local development tables from `template/tables/*.yaml`, indexes included, and seeds
 * the ones `_test_data_` has data for (KOE-1345).
 *
 *   npm run init-tables              create what is missing, seed what was created
 *   npm run init-tables -- --plan    print the tables and indexes the templates declare, touch nothing
 *   npm run init-tables -- --reset   delete the tables first, then create and seed everything again
 *
 * Re-running is safe: an existing table is kept, and only the indexes the template has added since
 * are created on it. The endpoint is the dynamodb-local container `npm run init-dynamodb` starts;
 * DYNAMODB_ENDPOINT overrides it.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb'
import { readTableDefinitions } from './lib/tables.mjs'

const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'
const DATA_DIR = './_test_data_'
const BATCH_SIZE = 25

/** The seed files that hold one item each; the batch files name their table themselves. */
const ITEM_FILES = {
  'official-table': ['official1.json', 'official2.json', 'official3.json'],
  'organizer-table': ['organizer1.json'],
}

const args = new Set(process.argv.slice(2))
const plan = args.has('--plan')
const reset = args.has('--reset')

const client = new DynamoDBClient({
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: ENDPOINT,
  region: 'eu-north-1',
})

const describe = async (TableName) => {
  try {
    return (await client.send(new DescribeTableCommand({ TableName }))).Table
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') return undefined
    throw error
  }
}

const deleteTable = async (TableName) => {
  if (!(await describe(TableName))) return
  await client.send(new DeleteTableCommand({ TableName }))
  await waitUntilTableNotExists({ client, maxWaitTime: 60 }, { TableName })
  console.log(`  deleted ${TableName}`)
}

/** Creates the table, or adds to an existing one the indexes it lacks. Returns whether it was created. */
const ensureTable = async ({ definition, timeToLive }) => {
  const { TableName } = definition
  const existing = await describe(TableName)
  if (!existing) {
    await client.send(new CreateTableCommand(definition))
    await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName })
    if (timeToLive) {
      await client.send(new UpdateTimeToLiveCommand({ TableName, TimeToLiveSpecification: timeToLive }))
    }
    const indexes = definition.GlobalSecondaryIndexes?.map((gsi) => gsi.IndexName) ?? []
    console.log(`  created ${TableName}${indexes.length ? ` with ${indexes.join(', ')}` : ''}`)
    return true
  }

  const present = new Set(existing.GlobalSecondaryIndexes?.map((gsi) => gsi.IndexName))
  const missing = (definition.GlobalSecondaryIndexes ?? []).filter((gsi) => !present.has(gsi.IndexName))
  for (const gsi of missing) {
    // One index per UpdateTable; the attribute definitions must name its keys.
    await client.send(
      new UpdateTableCommand({
        AttributeDefinitions: definition.AttributeDefinitions,
        GlobalSecondaryIndexUpdates: [{ Create: gsi }],
        TableName,
      })
    )
    console.log(`  added ${gsi.IndexName} to ${TableName}`)
  }
  if (!missing.length) console.log(`  kept ${TableName}`)
  return false
}

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8'))

/** The batch files, keyed by the table each of their top-level keys names. */
const readBatchSeeds = async () => {
  const seeds = new Map()
  for (const name of (await fs.readdir(DATA_DIR)).filter((n) => n.endsWith('.json')).sort()) {
    const content = await readJson(name)
    for (const [table, requests] of Object.entries(content)) {
      if (!Array.isArray(requests) || !requests.every((request) => request.PutRequest)) continue
      seeds.set(table, [...(seeds.get(table) ?? []), ...requests])
    }
  }
  return seeds
}

const batchWrite = async (table, requests) => {
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    let RequestItems = { [table]: requests.slice(i, i + BATCH_SIZE) }
    while (Object.keys(RequestItems).length) {
      const { UnprocessedItems = {} } = await client.send(new BatchWriteItemCommand({ RequestItems }))
      RequestItems = Object.keys(UnprocessedItems).length ? UnprocessedItems : {}
    }
  }
}

const seed = async (table, batches) => {
  let count = 0
  const requests = batches.get(table)
  if (requests) {
    await batchWrite(table, requests)
    count += requests.length
  }
  for (const name of ITEM_FILES[table] ?? []) {
    await client.send(new PutItemCommand({ Item: await readJson(name), TableName: table }))
    count += 1
  }
  if (count) console.log(`  seeded ${table} with ${count} items`)
}

const tables = await readTableDefinitions()

if (plan) {
  for (const { definition, file, timeToLive } of tables) {
    const keys = definition.KeySchema.map((key) => `${key.AttributeName} (${key.KeyType})`).join(', ')
    console.log(`${definition.TableName}  <-  ${file}`)
    console.log(`  keys: ${keys}${timeToLive ? `; ttl: ${timeToLive.AttributeName}` : ''}`)
    for (const gsi of definition.GlobalSecondaryIndexes ?? []) {
      const gsiKeys = gsi.KeySchema.map((key) => `${key.AttributeName} (${key.KeyType})`).join(', ')
      console.log(`  ${gsi.IndexName}: ${gsiKeys}; projection ${gsi.Projection.ProjectionType}`)
    }
  }
  process.exit(0)
}

console.log(`DynamoDB at ${ENDPOINT}: ${tables.length} tables in the templates`)
if (reset) {
  for (const { definition } of tables) await deleteTable(definition.TableName)
}
const batches = await readBatchSeeds()
for (const table of tables) {
  const created = await ensureTable(table)
  if (created) await seed(table.definition.TableName, batches)
}
