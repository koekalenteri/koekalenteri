/**
 * Shared bits of the integration tests (`*.integration.test.ts`, the `integration` vitest project):
 * the lambda code against real tables in a DynamoDB-local, created from `template/tables` by
 * `scripts/integration-global-setup.mjs` and reached through the endpoint, access key and table
 * names `scripts/test-integration.js` sets (KOE-1369).
 *
 * The tables are reset once per run and every file may run beside the others, so a test writes
 * under ids and partition values of its own and asserts on those, never on a table's whole content.
 */
import { randomUUID } from 'node:crypto'
import { DescribeTableCommand, DescribeTimeToLiveCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'

/** A value unique to one test, readable in a failure: `event-1a2b3c4d`. */
export const uniqueId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

/** The raw client, configured like the lambda code's: from the environment alone. */
const client = new DynamoDBClient({})

/** The table as DynamoDB-local describes it, for comparing with what the template declares. */
export const describeTable = async (TableName: string) =>
  (await client.send(new DescribeTableCommand({ TableName }))).Table

export const describeTimeToLive = async (TableName: string) =>
  (await client.send(new DescribeTimeToLiveCommand({ TableName }))).TimeToLiveDescription
