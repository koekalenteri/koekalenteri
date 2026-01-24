// Create a DocumentClient that represents the query to add an item

import type { ConditionCheck, Delete, Put, ReturnValue, TransactWriteItem, Update } from '@aws-sdk/client-dynamodb'
import type {
  BatchWriteCommandInput,
  DeleteCommandInput,
  GetCommandInput,
  PutCommandInput,
  QueryCommandInput,
  ScanCommandInput,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'

import { DynamoDBClient, TransactionCanceledException, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

interface QueryParams {
  key: string
  values: Record<string, any>
  table?: string
  index?: string
  names?: Record<string, string>
  forward?: boolean
  limit?: number
  filterExpression?: string
}

type PutWithoutTable = Omit<Put, 'TableName'>
type UpdateWithoutTable = Omit<Update, 'TableName'>
type DeleteWithoutTable = Omit<Delete, 'TableName'>
type ConditionCheckWithoutTable = Omit<ConditionCheck, 'TableName'>

// Union of the valid stripped operations
export type TransactWriteItemWithoutTable = {
  Put?: PutWithoutTable
  Update?: UpdateWithoutTable
  Delete?: DeleteWithoutTable
  ConditionCheck?: ConditionCheckWithoutTable
}

function fromSamLocalTable(table: string) {
  // sam local does not provide proper table name as env variable
  // EventTable => event-table
  return table.replaceAll(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase()
}

const processOperations = (
  operations: Record<string, any> | undefined,
  names: Record<string, string>,
  values: Record<string, string>,
  type: 'SET' | 'ADD'
): string | null => {
  if (!operations || Object.keys(operations).length === 0) {
    return null
  }
  const operand = type === 'SET' ? ' = ' : ' '
  const parts: string[] = []

  for (const [field, value] of Object.entries(operations)) {
    const nameKey = `#${field}`
    const valueKey = `:${field}`

    if (names[nameKey]) {
      throw new Error(`DynamoDB: can not SET and ADD same field: ${field}`)
    }

    names[nameKey] = field
    values[valueKey] = value

    parts.push(`${nameKey}${operand}${valueKey}`)
  }

  return parts.length > 0 ? `${type} ${parts.join(', ')}` : null
}

export default class CustomDynamoClient {
  table: string
  client: DynamoDBClient
  docClient: DynamoDBDocumentClient

  constructor(tableName: string) {
    const options: { endpoint?: string } = {}

    this.table = fromSamLocalTable(tableName)

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000'

      console.info('LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table)
    }

    this.client = new DynamoDBClient(options)
    this.docClient = DynamoDBDocumentClient.from(this.client)
  }

  async readAll<T extends object>(
    table?: string,
    filterExpression?: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<T[] | undefined> {
    const params: ScanCommandInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
    }

    // Create or extend filter expression to filter out deleted items
    let finalFilterExpression = 'attribute_not_exists(deletedAt)'

    if (filterExpression) {
      finalFilterExpression = `(${finalFilterExpression}) AND (${filterExpression})`
    }

    params.FilterExpression = finalFilterExpression

    // Add expression attribute values if provided
    if (expressionAttributeValues) {
      params.ExpressionAttributeValues = expressionAttributeValues
    }

    // Add expression attribute names if provided
    if (expressionAttributeNames) {
      params.ExpressionAttributeNames = expressionAttributeNames
    }

    console.log('DB.scan', params)
    const data = await this.docClient.send(new ScanCommand(params))

    return data.Items as T[]
  }

  async read<T extends object>(
    key: Record<string, number | string | undefined> | null,
    table?: string
  ): Promise<T | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provided, returning undefined')
      return
    }
    const params: GetCommandInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
    }
    console.log('DB.get', params)
    const data = await this.docClient.send(new GetCommand(params))
    return data.Item as T
  }

  /**
   * Query items in the table
   * @param params - Query parameters
   * @returns Promise with the query result
   */
  async query<T extends object>(params: QueryParams): Promise<T[] | undefined> {
    if (!params.key) {
      console.warn('CustomDynamoClient.query: no key provided, returning undefined')
      return
    }
    const queryParams: QueryCommandInput = {
      TableName: params.table ? fromSamLocalTable(params.table) : this.table,
      IndexName: params.index,
      KeyConditionExpression: params.key,
      ExpressionAttributeValues: params.values,
      ExpressionAttributeNames: params.names,
      ScanIndexForward: params.forward,
      Limit: params.limit,
      FilterExpression: params.filterExpression,
    }
    console.log('DB.query', queryParams)
    const data = await this.docClient.send(new QueryCommand(queryParams))
    return data.Items as T[]
  }

  async write<T extends object>(Item: T, table?: string): Promise<unknown> {
    const params: PutCommandInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Item,
    }
    console.log('DB.write', params)
    return this.docClient.send(new PutCommand(params))
  }

  async batchWrite<T extends object>(items: T[], table?: string) {
    const tableName = table ? fromSamLocalTable(table) : this.table
    const chunkSize = 25

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize).map((item) => ({
        PutRequest: {
          Item: item,
        },
      }))
      const params: BatchWriteCommandInput = {
        RequestItems: {
          [tableName]: chunk,
        },
      }
      console.log('DB.batchWrite', params)
      const result = await this.docClient.send(new BatchWriteCommand(params))
      console.log(result)
    }
  }

  /**
   * Updates an item in the table using a structured object format
   * @param key - The key of the item to update
   * @param updates - Object containing set and/or add operations
   * @param table - Optional table name
   * @param returnValues - Optional return values specification
   * @returns Promise with the update result
   *
   * Example:
   * ```
   * await client.update(
   *   { id: '123' },
   *   {
   *     set: { name: 'New Name', status: 'active' },
   *     add: { count: 1, points: 5 }
   *   }
   * )
   * ```
   */
  async update(
    key: Record<string, any>,
    updates: {
      set?: Record<string, any>
      add?: Record<string, any>
    },
    table?: string,
    returnValues?: ReturnValue
  ) {
    const names: Record<string, string> = {}
    const values: Record<string, any> = {}
    const expressionParts: string[] = []

    const setExpression = processOperations(updates.set, names, values, 'SET')
    if (setExpression) {
      expressionParts.push(setExpression)
    }

    const addExpression = processOperations(updates.add, names, values, 'ADD')
    if (addExpression) {
      expressionParts.push(addExpression)
    }

    // If no operations were provided, throw an error
    if (expressionParts.length === 0) {
      throw new Error('No update operations provided')
    }

    // Create params object for the update operation
    const params: UpdateCommandInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
      UpdateExpression: expressionParts.join(' '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }

    // Add ReturnValues if provided
    if (returnValues) {
      params.ReturnValues = returnValues
    }

    console.log('DB.update', params)
    return this.docClient.send(new UpdateCommand(params))
  }

  async delete(key: Record<string, number | string | undefined> | null, table?: string): Promise<boolean> {
    if (!key) {
      console.warn('CustomDynamoClient.delete: no key provided, returning false')
      return false
    }
    const params: DeleteCommandInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
    }
    console.log('DB.delete', params)

    try {
      await this.docClient.send(new DeleteCommand(params))
      return true
    } catch (error) {
      console.error('Error deleting item:', error)
      return false
    }
  }

  async transaction(items: TransactWriteItemWithoutTable[], table?: string) {
    const tableName = table ? fromSamLocalTable(table) : this.table
    const itemsWithTable: TransactWriteItem[] = items.map((item) => ({
      ConditionCheck: item.ConditionCheck && { ...item.ConditionCheck, TableName: tableName },
      Put: item.Put && { ...item.Put, TableName: tableName },
      Update: item.Update && { ...item.Update, TableName: tableName },
      Delete: item.Delete && { ...item.Delete, TableName: tableName },
    }))
    console.log('DB.transaction', itemsWithTable)

    try {
      await this.docClient.send(
        new TransactWriteItemsCommand({
          TransactItems: itemsWithTable,
        })
      )
    } catch (err) {
      if (err instanceof TransactionCanceledException || (err as any).name === 'TransactionCanceledException') {
        console.error('❌ Transaction was canceled')

        const reasons = (err as TransactionCanceledException).CancellationReasons
        if (reasons) {
          reasons.forEach((reason, index) => {
            console.log(`🔹 Operation ${index + 1}:`)
            console.log(`   Code: ${reason.Code}`)
            if (reason.Message) {
              console.log(`   Message: ${reason.Message}`)
            }
          })
        } else {
          console.log('No cancellation reasons returned')
        }
      } else {
        console.error('❗ Unexpected error:', err)
      }
    }
  }
}
