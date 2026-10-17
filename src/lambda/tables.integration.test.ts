import type { AttributeDefinition, KeySchemaElement, Projection } from '@aws-sdk/client-dynamodb'
import { readTableDefinitions } from '../../scripts/lib/tables.mjs'
import { describeTable, describeTimeToLive, uniqueId } from './test-utils/integration'
import CustomDynamoClient from './utils/CustomDynamoClient'

/**
 * The templates are what production is built from and what the global setup built these tables
 * from; this is the check that the two readings agree, table by table, and that every table name
 * the lambdas take from their environment is one of them. Order is not compared: DescribeTable does
 * not promise the template's.
 */
const byName = <T extends { AttributeName?: string }>(items: T[] = []) =>
  [...items].sort((a, b) => (a.AttributeName ?? '').localeCompare(b.AttributeName ?? ''))

const attributes = (items: AttributeDefinition[] = []) =>
  byName(items).map(({ AttributeName, AttributeType }) => ({ AttributeName, AttributeType }))

const keys = (items: KeySchemaElement[] = []) =>
  byName(items).map(({ AttributeName, KeyType }) => ({ AttributeName, KeyType }))

const projection = (value: Projection | undefined) => ({
  NonKeyAttributes: [...(value?.NonKeyAttributes ?? [])].sort((a, b) => a.localeCompare(b)),
  ProjectionType: value?.ProjectionType,
})

const indexes = (items: { IndexName?: string; KeySchema?: KeySchemaElement[]; Projection?: Projection }[] = []) =>
  Object.fromEntries(
    items.map((index) => [
      index.IndexName,
      { KeySchema: keys(index.KeySchema), Projection: projection(index.Projection) },
    ])
  )

const tables = await readTableDefinitions()

describe('the tables DynamoDB-local was given from template/tables', () => {
  it.each(tables.map((table) => [table.definition.TableName, table]))(
    '%s has the keys, attributes and indexes its template declares',
    async (_name, { definition, timeToLive }) => {
      const table = await describeTable(definition.TableName)

      expect(table?.TableStatus).toBe('ACTIVE')
      expect(keys(table?.KeySchema)).toEqual(keys(definition.KeySchema))
      expect(attributes(table?.AttributeDefinitions)).toEqual(attributes(definition.AttributeDefinitions))
      expect(indexes(table?.GlobalSecondaryIndexes)).toEqual(indexes(definition.GlobalSecondaryIndexes))
      expect(indexes(table?.LocalSecondaryIndexes)).toEqual(indexes(definition.LocalSecondaryIndexes))

      if (timeToLive) {
        await expect(describeTimeToLive(definition.TableName)).resolves.toMatchObject({
          AttributeName: timeToLive.AttributeName,
          TimeToLiveStatus: 'ENABLED',
        })
      }
    }
  )

  // The lambdas take their table names from `*_TABLE_NAME` (the template's Globals; here the values
  // scripts/test-integration.js sets) and CustomDynamoClient derives the local name from each: every
  // one of those must be a table the templates declare, and every template table must be reachable.
  it('every *_TABLE_NAME in the environment names a template table, and every template table is named', () => {
    const named = Object.entries(process.env)
      .filter(([name]) => name.endsWith('_TABLE_NAME'))
      .map(([, value]) => new CustomDynamoClient(value ?? uniqueId('unset')).table)
      .sort((a, b) => a.localeCompare(b))
    const declared = tables.map(({ definition }) => definition.TableName).sort((a, b) => a.localeCompare(b))

    expect(named).toEqual(declared)
  })
})
