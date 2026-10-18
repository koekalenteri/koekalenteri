/** Types for `tables.mjs`, read by the integration test that compares the templates with the tables. */
import type { CreateTableCommandInput, TimeToLiveSpecification } from '@aws-sdk/client-dynamodb'

export interface TableDefinition {
  /** The template file the table was read from. */
  file: string
  /** The CreateTable input, with the local table name (`event-table`). */
  definition: CreateTableCommandInput & { TableName: string }
  logicalId: string
  timeToLive?: TimeToLiveSpecification
}

export const readTableDefinitions: (dir?: string) => Promise<TableDefinition[]>
