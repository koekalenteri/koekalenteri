/**
 * The DynamoDB tables as the CloudFormation templates in `template/tables` declare them, in the
 * shape the SDK's CreateTable takes. The local development tables are created from this, so a
 * table or an index added to the template exists locally without a second, hand-kept list
 * (KOE-1345).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'

const TABLES_DIR = './template/tables'

/** The CloudFormation intrinsic tags the templates use; their values are not needed here. */
const cloudFormationTags = ['!Ref', '!Join', '!Sub', '!GetAtt', '!Select', '!Split', '!If', '!Equals', '!Not'].map(
  (tag) => ({
    collection: 'seq',
    identify: () => false,
    tag,
  })
)
const scalarTags = ['!Ref', '!Sub', '!GetAtt'].map((tag) => ({
  identify: () => false,
  resolve: (value) => ({ [tag.slice(1)]: value }),
  tag,
}))

/**
 * The name SAM local gives a table: `!Ref EventTable` resolves to the logical id, and the Lambda
 * client turns that into `event-table` (see `fromSamLocalTable` in CustomDynamoClient).
 */
const localTableName = (logicalId) => logicalId.replaceAll(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase()

const parseTemplate = (text) => parse(text, { customTags: [...scalarTags, ...cloudFormationTags] })

const index = ({ IndexName, KeySchema, Projection }) => ({ IndexName, KeySchema, Projection })

/** One table template as CreateTable input, plus the time-to-live it asks for. */
const tableDefinition = (text) => {
  const resources = parseTemplate(text)
  const entries = Object.entries(resources).filter(([, resource]) => resource?.Type === 'AWS::DynamoDB::Table')
  if (entries.length !== 1) throw new Error(`Expected one table per template, found ${entries.length}`)

  const [logicalId, { Properties }] = entries[0]
  const definition = {
    AttributeDefinitions: Properties.AttributeDefinitions,
    BillingMode: Properties.BillingMode ?? 'PAY_PER_REQUEST',
    KeySchema: Properties.KeySchema,
    TableName: localTableName(logicalId),
  }
  if (Properties.GlobalSecondaryIndexes) {
    definition.GlobalSecondaryIndexes = Properties.GlobalSecondaryIndexes.map(index)
  }
  if (Properties.LocalSecondaryIndexes) {
    definition.LocalSecondaryIndexes = Properties.LocalSecondaryIndexes.map(index)
  }

  return { definition, logicalId, timeToLive: Properties.TimeToLiveSpecification }
}

/** Every table in the templates directory, in file order. */
export const readTableDefinitions = async (dir = TABLES_DIR) => {
  const files = (await fs.readdir(dir)).filter((name) => /\.ya?ml$/i.test(name)).sort()
  return Promise.all(
    files.map(async (name) => ({ file: name, ...tableDefinition(await fs.readFile(path.join(dir, name), 'utf8')) }))
  )
}
