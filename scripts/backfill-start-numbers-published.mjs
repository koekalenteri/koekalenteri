#!/usr/bin/env node

// KOE-1266: events that predate the start number publishing feature have no `startNumbersPublished`
// field, and an absent field means published — so publishing their start list also publishes the
// numbers, skipping the KOE-1006 decision entirely. This backfill writes the explicit state that
// matches what each event's public list shows today: `false` wherever the start list (or a class's
// list) is not published, so the numbers stay hidden until the secretary releases them; nothing is
// written where the list is already out, because those numbers are visible and must stay visible.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const usage = `Usage:
  npm run backfill-start-numbers -- --stack <stack-name-or-stage> [--apply]
  npm run backfill-start-numbers -- --table <event-table> [--apply]

Without --apply the script only reports what it would write.
The table can also be supplied with EVENT_TABLE_NAME.
With --stack, values such as dev and koekalenteri-dev both resolve to the koekalenteri-dev stack.
AWS credentials, profile and region are resolved by the standard AWS SDK credential chain.`

const parseArgs = (args) => {
  const options = { apply: false, table: process.env.EVENT_TABLE_NAME }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--apply') {
      options.apply = true
      continue
    }
    if (argument === '--stack' || argument === '--table') {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
      if (argument === '--stack') options.stack = value
      else options.table = value
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  if (options.stack) {
    const stackName = options.stack.startsWith('koekalenteri-') ? options.stack : `koekalenteri-${options.stack}`
    options.table ??= `event-table-v3-${stackName}`
  }

  return options
}

const scanAll = async (client, input) => {
  const items = []
  let exclusiveStartKey

  do {
    const response = await client.send(new ScanCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }))
    items.push(...(response.Items ?? []))
    exclusiveStartKey = response.LastEvaluatedKey
  } while (exclusiveStartKey)

  return items
}

/**
 * The explicit `startNumbersPublished` an event should have, or undefined when nothing needs writing.
 *
 * The rule mirrors what the public list shows today: a published list has been showing its numbers all
 * along (absent means published), so only the unpublished side gets an explicit `false`.
 */
export const backfillValue = (event) => {
  if (event.startNumbersPublished !== undefined) return undefined

  const list = event.startListPublished

  // An explicitly unpublished list: the numbers decision is still fully open.
  if (list === false) return false

  // A per-class map: hold back only the classes whose list is not out.
  if (list && typeof list === 'object') {
    const value = Object.fromEntries(Object.keys(list).map((eventClass) => [eventClass, Boolean(list[eventClass])]))
    return Object.values(value).every(Boolean) ? undefined : value
  }

  // true or absent: the list is public and has been showing its numbers — leave it be.
  return undefined
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help || !options.table) {
    console.log(usage)
    process.exit(options.help ? 0 : 1)
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
  const events = await scanAll(client, {
    ProjectionExpression: '#id, #name, startDate, startListPublished, startNumbersPublished',
    ExpressionAttributeNames: { '#id': 'id', '#name': 'name' },
    TableName: options.table,
  })

  let written = 0
  for (const event of events) {
    const value = backfillValue(event)
    if (value === undefined) continue

    console.log(
      `${options.apply ? 'writing' : 'would write'} ${event.id} (${event.startDate ?? '?'} ${event.name ?? ''}): startNumbersPublished = ${JSON.stringify(value)}`
    )
    written++

    if (options.apply) {
      await client.send(
        new UpdateCommand({
          // The write is skipped if some other writer set the field meanwhile.
          ConditionExpression: 'attribute_not_exists(startNumbersPublished)',
          ExpressionAttributeValues: { ':value': value },
          Key: { id: event.id },
          TableName: options.table,
          UpdateExpression: 'SET startNumbersPublished = :value',
        })
      )
    }
  }

  console.log(`${events.length} events scanned, ${written} ${options.apply ? 'updated' : 'to update'}`)
}

const isDirectRun = process.argv[1]?.endsWith('backfill-start-numbers-published.mjs')
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message ?? error)
    process.exit(1)
  })
}
