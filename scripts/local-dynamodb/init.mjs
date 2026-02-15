#!/usr/bin/env node

import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const DDB_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'
const REGION = process.env.AWS_REGION ?? 'eu-west-1'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const tablesDir = path.join(projectRoot, 'template', 'tables')
const testDataDir = path.join(projectRoot, '_test_data_')

const client = new DynamoDBClient({
  region: REGION,
  endpoint: DDB_ENDPOINT,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})

function stripUnsupportedCloudFormationYaml(yamlText) {
  const lines = yamlText.split(/\r?\n/)
  const out = []

  // The table templates include CloudFormation intrinsics (e.g. !Join, !Ref) mainly in
  // TableName and Tags. For local table creation we don't need those, so we strip them.
  let skippingTagsBlock = false
  let tagsIndent = null

  for (const line of lines) {
    if (!skippingTagsBlock) {
      const m = line.match(/^(\s*)Tags:\s*$/)
      if (m) {
        skippingTagsBlock = true
        tagsIndent = m[1].length
        continue
      }
    } else {
      // End tags block when indentation decreases.
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0
      if (line.trim() !== '' && currentIndent <= tagsIndent) {
        skippingTagsBlock = false
        tagsIndent = null
        // fallthrough to normal handling of this line
      } else {
        continue
      }
    }

    if (/^\s*TableName:\s*!/.test(line)) continue
    out.push(line.replace(/!Ref\s+[^\s#]+/g, '"LOCAL"'))
  }

  return out.join('\n')
}

async function loadTableDefinitionFromYamlFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  const sanitized = stripUnsupportedCloudFormationYaml(raw)
  const doc = parseYaml(sanitized)

  // Each file has a single top-level resource like:
  //   EventTable:
  //     Type: AWS::DynamoDB::Table
  //     Properties: ...
  const [logicalId] = Object.keys(doc ?? {})
  if (!logicalId) throw new Error(`No top-level key found in ${filePath}`)

  const resource = doc[logicalId]
  const props = resource?.Properties
  if (!props) throw new Error(`Missing Properties in ${filePath}`)

  return props
}

async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }))
    return true
  } catch (err) {
    if (err?.name === 'ResourceNotFoundException') return false
    throw err
  }
}

async function createTable({ tableName, props }) {
  if (await tableExists(tableName)) {
    process.stdout.write(`- ${tableName}: exists\n`)
    return
  }

  const input = {
    TableName: tableName,
    BillingMode: props.BillingMode ?? 'PAY_PER_REQUEST',
    AttributeDefinitions: props.AttributeDefinitions,
    KeySchema: props.KeySchema,
    GlobalSecondaryIndexes: props.GlobalSecondaryIndexes,
    LocalSecondaryIndexes: props.LocalSecondaryIndexes,
    StreamSpecification: props.StreamSpecification,
  }

  // Remove undefined keys to satisfy strict validation.
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) delete input[key]
  }

  await client.send(new CreateTableCommand(input))
  process.stdout.write(`- ${tableName}: created\n`)
}

async function batchWriteAll(requestItems) {
  const tableNames = Object.keys(requestItems)
  if (tableNames.length === 0) return

  let unprocessed = requestItems
  // DynamoDB may return UnprocessedItems; keep retrying with backoff.
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await client.send(new BatchWriteItemCommand({ RequestItems: unprocessed }))
    unprocessed = res.UnprocessedItems ?? {}
    if (Object.keys(unprocessed).length === 0) return
    await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)))
  }

  throw new Error(`BatchWrite did not complete; still unprocessed: ${JSON.stringify(unprocessed)}`)
}

async function seedFromJsonFile(fileName) {
  const fullPath = path.join(testDataDir, fileName)
  const json = JSON.parse(await fs.readFile(fullPath, 'utf8'))

  // Format matches AWS CLI batch-write-item RequestItems payload:
  // { "table-name": [ { PutRequest: { Item: ... } }, ... ] }
  const [tableName] = Object.keys(json)
  const items = json[tableName]
  if (!Array.isArray(items) || items.length === 0) return

  process.stdout.write(`Seeding ${tableName} from ${fileName} (${items.length} items)\n`)

  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25)
    await batchWriteAll({ [tableName]: batch })
  }
}

async function _putItemFromFile(tableName, fileName) {
  const fullPath = path.join(testDataDir, fileName)
  const item = JSON.parse(await fs.readFile(fullPath, 'utf8'))
  await client.send(new PutItemCommand({ TableName: tableName, Item: item }))
}

async function main() {
  process.stdout.write(`Using DynamoDB endpoint ${DDB_ENDPOINT}\n`)

  const tableFiles = (await fs.readdir(tablesDir)).filter((f) => f.endsWith('-table.yaml')).sort()

  process.stdout.write(`Creating tables from ${tableFiles.length} YAML definitions\n`)

  for (const file of tableFiles) {
    // Filenames are like "event-table.yaml" where the actual DynamoDB table name for local DX
    // is the filename without the extension.
    const tableName = file.replace(/\.ya?ml$/, '')
    const props = await loadTableDefinitionFromYamlFile(path.join(tablesDir, file))
    await createTable({ tableName, props })
  }

  // Seed test data (kept intentionally aligned with the existing _test_data_ payloads).
  await seedFromJsonFile('events.json')
  await seedFromJsonFile('judges.json')
  await seedFromJsonFile('dogs.json')
  await seedFromJsonFile('registrations.json')
  await seedFromJsonFile('eventTypes.json')
  await seedFromJsonFile('emailTemplates.json')

  process.stdout.write('Seeding individual items\n')

  // Note: `_test_data_/official*.json` and `organizer1.json` use numeric ids, but the local
  // tables use string primary keys (id: S) to match the table definitions.
  // Keep this seeding step disabled until test data is updated to match the schema.
  // await putItemFromFile('official-table', 'official1.json')
  // await putItemFromFile('official-table', 'official2.json')
  // await putItemFromFile('official-table', 'official3.json')
  // await putItemFromFile('organizer-table', 'organizer1.json')

  process.stdout.write('Done\n')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
