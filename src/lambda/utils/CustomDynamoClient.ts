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
import { inspect } from 'node:util'

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

/**
 * Default CloudWatch/Lambda object logging is shallow and will collapse arrays/objects into `[Object]`.
 * Force deep inspection so DynamoDB request payloads (e.g. batchWrite items) are fully visible.
 */
const logDb = (operation: string, payload: unknown) => {
  // Keep the operation token as the first argument for easy CW filtering (e.g. "DB.batchWrite")
  console.info(operation, inspect(payload, { depth: null, colors: false, maxArrayLength: null, compact: false }))
}

const getAwsErrorName = (err: unknown): string => {
  if (!err || typeof err !== 'object') return 'UnknownError'
  return typeof (err as any).name === 'string' ? (err as any).name : 'UnknownError'
}

const getAwsErrorMessage = (err: unknown): string => {
  if (!err || typeof err !== 'object') return String(err)
  return typeof (err as any).message === 'string' ? (err as any).message : String(err)
}

/**
 * Add DynamoDB table name context to errors.
 *
 * AWS SDK errors can be generic (e.g. "Cannot do operations on a non-existent table")
 * so include the resolved `TableName` in the thrown message.
 */
const withTableContext = (operation: string, tableName: string, err: unknown): Error => {
  const name = getAwsErrorName(err)
  const msg = getAwsErrorMessage(err)
  return new Error(`[${operation}] table=${tableName} :: ${name}: ${msg}`, { cause: err as any })
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
    const tableName = table ? fromSamLocalTable(table) : this.table
    const params: ScanCommandInput = {
      TableName: tableName,
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

    logDb('DB.scan', params)
    let data
    try {
      data = await this.docClient.send(new ScanCommand(params))
    } catch (err) {
      throw withTableContext('DB.scan', tableName, err)
    }

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
    const tableName = table ? fromSamLocalTable(table) : this.table
    const params: GetCommandInput = {
      TableName: tableName,
      Key: key,
    }
    logDb('DB.get', params)
    let data
    try {
      data = await this.docClient.send(new GetCommand(params))
    } catch (err) {
      throw withTableContext('DB.get', tableName, err)
    }
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
    const tableName = params.table ? fromSamLocalTable(params.table) : this.table
    const queryParams: QueryCommandInput = {
      TableName: tableName,
      IndexName: params.index,
      KeyConditionExpression: params.key,
      ExpressionAttributeValues: params.values,
      ExpressionAttributeNames: params.names,
      ScanIndexForward: params.forward,
      Limit: params.limit,
      FilterExpression: params.filterExpression,
    }
    logDb('DB.query', queryParams)
    let data
    try {
      data = await this.docClient.send(new QueryCommand(queryParams))
    } catch (err) {
      throw withTableContext('DB.query', tableName, err)
    }
    return data.Items as T[]
  }

  async write<T extends object>(Item: T, table?: string): Promise<unknown> {
    const tableName = table ? fromSamLocalTable(table) : this.table
    const params: PutCommandInput = {
      TableName: tableName,
      Item,
    }
    logDb('DB.write', params)
    try {
      return await this.docClient.send(new PutCommand(params))
    } catch (err) {
      throw withTableContext('DB.write', tableName, err)
    }
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
      logDb('DB.batchWrite', params)
      let result
      try {
        result = await this.docClient.send(new BatchWriteCommand(params))
      } catch (err) {
        throw withTableContext('DB.batchWrite', tableName, err)
      }
      logDb('DB.batchWrite.result', result)
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
    const tableName = table ? fromSamLocalTable(table) : this.table
    const params: UpdateCommandInput = {
      TableName: tableName,
      Key: key,
      UpdateExpression: expressionParts.join(' '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }

    // Add ReturnValues if provided
    if (returnValues) {
      params.ReturnValues = returnValues
    }

    logDb('DB.update', params)
    try {
      return await this.docClient.send(new UpdateCommand(params))
    } catch (err) {
      throw withTableContext('DB.update', tableName, err)
    }
  }

  async delete(key: Record<string, number | string | undefined> | null, table?: string): Promise<boolean> {
    if (!key) {
      console.warn('CustomDynamoClient.delete: no key provided, returning false')
      return false
    }
    const tableName = table ? fromSamLocalTable(table) : this.table
    const params: DeleteCommandInput = {
      TableName: tableName,
      Key: key,
    }
    logDb('DB.delete', params)

    try {
      await this.docClient.send(new DeleteCommand(params))
      return true
    } catch (error) {
      console.error(withTableContext('DB.delete', tableName, error))
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
    logDb('DB.transaction', itemsWithTable)

    try {
      await this.docClient.send(
        new TransactWriteItemsCommand({
          TransactItems: itemsWithTable,
        })
      )
    } catch (err) {
      // Always log an error that includes the resolved table name.
      console.error(withTableContext('DB.transaction', tableName, err))
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
