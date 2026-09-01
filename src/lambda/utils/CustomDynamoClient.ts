// Create a DocumentClient that represents the query to add an item

import type { ConditionCheck, Delete, Put, ReturnValue, TransactWriteItem, Update } from '@aws-sdk/client-dynamodb'
import type {
  BatchGetCommandInput,
  BatchWriteCommandInput,
  DeleteCommandInput,
  GetCommandInput,
  PutCommandInput,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  TransactWriteCommandInput,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { inspect, isDeepStrictEqual } from 'node:util'
import { DynamoDBClient, TransactionCanceledException, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

interface QueryParams {
  key: string
  values: Record<string, any>
  consistent?: boolean
  table?: string
  index?: string
  names?: Record<string, string>
  forward?: boolean
  limit?: number
  filterExpression?: string
}

interface ReadAllOptions {
  filter?: string
  names?: Record<string, string>
  projection?: string
  table?: string
  values?: Record<string, any>
}

type PutWithOptionalTable = Omit<Put, 'TableName'> & { TableName?: string }
type UpdateWithOptionalTable = Omit<Update, 'TableName'> & { TableName?: string }
type DeleteWithOptionalTable = Omit<Delete, 'TableName'> & { TableName?: string }
type ConditionCheckWithOptionalTable = Omit<ConditionCheck, 'TableName'> & { TableName?: string }

type UpdateCondition = {
  expression: string
  names?: Record<string, string>
  values?: Record<string, any>
}

// Union of the valid stripped operations
export type TransactWriteItemWithoutTable = {
  Put?: PutWithOptionalTable
  Update?: UpdateWithOptionalTable
  Delete?: DeleteWithOptionalTable
  ConditionCheck?: ConditionCheckWithOptionalTable
}

/**
 * sam local does not provide proper table name as env variable
 * EventTable -> event-table
 **/
const fromSamLocalTable = (table: string) => table.replaceAll(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase()

/**
 * Sanitizes a string into a valid DynamoDB ExpressionAttributeNames key suffix.
 * DynamoDB requires keys to start with a letter or underscore (after `#`) and
 * contain only alphanumeric characters and underscores.
 * e.g. "2026-08-22" → "n2026_08_22", "my-field" → "my_field"
 */
const toSafeExpressionName = (s: string): string => {
  const safe = s.replaceAll(/\W/g, '_')
  return /^\d/.test(safe) ? `n${safe}` : safe
}

const toPathExpression = (field: string): { duplicateKey: string; path: string } => {
  const segments = field.split('.')
  const nameKeys = segments.map((segment) =>
    String(Number(segment)) === segment ? `[${segment}]` : `#${toSafeExpressionName(segment)}`
  )
  return {
    duplicateKey: toSafeExpressionName(field),
    path: nameKeys.reduce((acc, part) => {
      if (!acc) return part
      return part.startsWith('[') ? `${acc}${part}` : `${acc}.${part}`
    }, ''),
  }
}

const processOperations = (
  operations: Record<string, any> | undefined,
  names: Record<string, string>,
  values: Record<string, string>,
  seenFields: Set<string>,
  type: 'SET' | 'ADD'
): string | null => {
  if (!operations || Object.keys(operations).length === 0) {
    return null
  }
  const operand = type === 'SET' ? ' = ' : ' '
  const parts: string[] = []

  for (const [field, value] of Object.entries(operations)) {
    const { duplicateKey, path } = toPathExpression(field)

    if (seenFields.has(duplicateKey)) {
      throw new Error(`DynamoDB: duplicate field in update expression: ${field}`)
    }
    seenFields.add(duplicateKey)

    for (const segment of field.split('.')) {
      if (String(Number(segment)) === segment) continue
      names[`#${toSafeExpressionName(segment)}`] = segment
    }

    const valueKey = `:${field.replaceAll('.', '_').replaceAll(/\W/g, '_')}`
    values[valueKey] = value
    parts.push(`${path}${operand}${valueKey}`)
  }

  return parts.length > 0 ? `${type} ${parts.join(', ')}` : null
}

const processRemoveOperations = (
  operations: string[] | undefined,
  names: Record<string, string>,
  seenFields: Set<string>
): string | null => {
  if (!operations || operations.length === 0) {
    return null
  }

  const parts: string[] = []

  for (const field of operations) {
    const { duplicateKey, path } = toPathExpression(field)

    if (seenFields.has(duplicateKey)) {
      throw new Error(`DynamoDB: duplicate field in update expression: ${field}`)
    }
    seenFields.add(duplicateKey)

    for (const segment of field.split('.')) {
      if (String(Number(segment)) === segment) continue
      names[`#${toSafeExpressionName(segment)}`] = segment
    }

    parts.push(path)
  }

  return parts.length > 0 ? `REMOVE ${parts.join(', ')}` : null
}

/**
 * Default CloudWatch/Lambda object logging is shallow and will collapse arrays/objects into `[Object]`.
 * Force deep inspection so DynamoDB request payloads (e.g. batchWrite items) are fully visible.
 */
/**
 * The SDK error may cross a bundling boundary where instanceof fails, so fall back to
 * matching the error name, as the AWS SDK documentation recommends.
 */
const isTransactionCanceled = (err: unknown): err is TransactionCanceledException =>
  err instanceof TransactionCanceledException || (err instanceof Error && err.name === 'TransactionCanceledException')

const logDb = (operation: string, payload: unknown) => {
  // Keep the operation token as the first argument for easy CW filtering (e.g. "DB.batchWrite")
  console.info(operation, inspect(payload, { colors: false, compact: false, depth: null, maxArrayLength: null }))
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

      console.info(`LOCAL DynamoDB: endpoint=${options.endpoint}, table: ${this.table}`)
    }

    this.client = new DynamoDBClient(options)
    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    })
  }

  async readAll<T extends object>({
    table,
    filter,
    values,
    names,
    projection,
  }: ReadAllOptions = {}): Promise<T[] | undefined> {
    const params: ScanCommandInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
    }

    // Create or extend filter expression to filter out deleted items
    let finalFilterExpression = 'attribute_not_exists(deletedAt)'

    if (filter) {
      finalFilterExpression = `(${finalFilterExpression}) AND (${filter})`
    }

    params.FilterExpression = finalFilterExpression

    if (projection) {
      params.ProjectionExpression = projection
    }

    // Add expression attribute values if provided
    if (values) {
      params.ExpressionAttributeValues = values
    }

    // Add expression attribute names if provided
    if (names) {
      params.ExpressionAttributeNames = names
    }

    const items: T[] = []
    let lastEvaluatedKey: Record<string, any> | undefined

    do {
      const scanParams: ScanCommandInput = {
        ...params,
        ExclusiveStartKey: lastEvaluatedKey,
      }

      logDb('DB.scan', scanParams)
      const data = await this.docClient.send(new ScanCommand(scanParams))

      if (data.Items) {
        items.push(...(data.Items as T[]))
      }

      lastEvaluatedKey = data.LastEvaluatedKey
    } while (lastEvaluatedKey)

    return items
  }

  /**
   * Point lookups for a known set of keys in one round trip. DynamoDB caps a request at 100 keys
   * and may return some of them as unprocessed, so both are handled here.
   */
  async batchGet<T extends object>(keys: Record<string, number | string>[], table?: string): Promise<T[]> {
    if (!keys.length) return []

    const tableName = table ? fromSamLocalTable(table) : this.table
    const items: T[] = []

    for (let i = 0; i < keys.length; i += 100) {
      let requestItems: BatchGetCommandInput['RequestItems'] = { [tableName]: { Keys: keys.slice(i, i + 100) } }

      for (let attempt = 0; attempt < 3 && requestItems; attempt++) {
        const params: BatchGetCommandInput = { RequestItems: requestItems }
        logDb('DB.batchGet', params)
        const data = await this.docClient.send(new BatchGetCommand(params))
        items.push(...((data.Responses?.[tableName] ?? []) as T[]))
        requestItems = Object.keys(data.UnprocessedKeys ?? {}).length ? data.UnprocessedKeys : undefined
      }
    }

    return items
  }

  async read<T extends object>(
    key: Record<string, number | string | undefined> | null,
    table?: string,
    consistent = false
  ): Promise<T | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provided, returning undefined')
      return
    }
    const params: GetCommandInput = {
      Key: key,
      TableName: table ? fromSamLocalTable(table) : this.table,
    }
    if (consistent) params.ConsistentRead = true
    logDb('DB.get', params)
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
      ...(params.consistent ? { ConsistentRead: true } : {}),
      ExpressionAttributeNames: params.names,
      ExpressionAttributeValues: params.values,
      FilterExpression: params.filterExpression,
      IndexName: params.index,
      KeyConditionExpression: params.key,
      Limit: params.limit,
      ScanIndexForward: params.forward,
      TableName: params.table ? fromSamLocalTable(params.table) : this.table,
    }

    const items: T[] = []
    let lastEvaluatedKey: QueryCommandOutput['LastEvaluatedKey']

    do {
      const remainingLimit = params.limit === undefined ? undefined : params.limit - items.length
      if (remainingLimit !== undefined && remainingLimit <= 0) break

      const pageParams: QueryCommandInput = {
        ...queryParams,
        Limit: remainingLimit,
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      }

      logDb('DB.query', pageParams)
      const data = await this.docClient.send(new QueryCommand(pageParams))

      if (data.Items) {
        items.push(...(data.Items as T[]))
      }

      lastEvaluatedKey = data.LastEvaluatedKey
    } while (lastEvaluatedKey)

    return items
  }

  async write<T extends object>(Item: T, table?: string): Promise<unknown> {
    const params: PutCommandInput = {
      Item,
      TableName: table ? fromSamLocalTable(table) : this.table,
    }
    logDb('DB.write', params)
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
      logDb('DB.batchWrite', params)
      const result = await this.docClient.send(new BatchWriteCommand(params))
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
      remove?: string[]
    },
    table?: string,
    returnValues?: ReturnValue,
    condition?: UpdateCondition
  ) {
    const names: Record<string, string> = {}
    const values: Record<string, any> = {}
    const seenFields = new Set<string>()
    const expressionParts: string[] = []

    const setExpression = processOperations(updates.set, names, values, seenFields, 'SET')
    if (setExpression) {
      expressionParts.push(setExpression)
    }

    const addExpression = processOperations(updates.add, names, values, seenFields, 'ADD')
    if (addExpression) {
      expressionParts.push(addExpression)
    }

    const removeExpression = processRemoveOperations(updates.remove, names, seenFields)
    if (removeExpression) {
      expressionParts.push(removeExpression)
    }

    // If no operations were provided, throw an error
    if (expressionParts.length === 0) {
      throw new Error('No update operations provided')
    }

    // Create params object for the update operation
    const conditionNames = condition?.names ?? {}
    const conditionValues = condition?.values ?? {}
    const duplicateName = Object.keys(conditionNames).find((key) => key in names && names[key] !== conditionNames[key])
    const duplicateValue = Object.keys(conditionValues).find(
      (key) => key in values && !isDeepStrictEqual(values[key], conditionValues[key])
    )
    if (duplicateName || duplicateValue) {
      throw new Error(`DynamoDB: duplicate condition attribute: ${duplicateName ?? duplicateValue}`)
    }

    const params: UpdateCommandInput = {
      ExpressionAttributeNames: { ...conditionNames, ...names },
      Key: key,
      TableName: table ? fromSamLocalTable(table) : this.table,
      UpdateExpression: expressionParts.join(' '),
    }

    const expressionAttributeValues = { ...conditionValues, ...values }
    if (Object.keys(expressionAttributeValues).length > 0) {
      params.ExpressionAttributeValues = expressionAttributeValues
    }

    if (condition) params.ConditionExpression = condition.expression

    // Add ReturnValues if provided
    if (returnValues) {
      params.ReturnValues = returnValues
    }

    logDb('DB.update', params)
    return this.docClient.send(new UpdateCommand(params))
  }

  async delete(key: Record<string, number | string | undefined> | null, table?: string): Promise<boolean> {
    if (!key) {
      console.warn('CustomDynamoClient.delete: no key provided, returning false')
      return false
    }
    const params: DeleteCommandInput = {
      Key: key,
      TableName: table ? fromSamLocalTable(table) : this.table,
    }
    logDb('DB.delete', params)

    try {
      await this.docClient.send(new DeleteCommand(params))
      return true
    } catch (error) {
      console.error('Error deleting item:', error)
      return false
    }
  }

  async transaction(items: TransactWriteItemWithoutTable[], table?: string) {
    const defaultTableName = table ? fromSamLocalTable(table) : this.table
    const withTableName = <T extends { TableName?: string }>(operation: T | undefined) =>
      operation && {
        ...operation,
        TableName: operation.TableName ? fromSamLocalTable(operation.TableName) : defaultTableName,
      }
    const itemsWithTable: TransactWriteItem[] = items.map((item) => ({
      ConditionCheck: withTableName(item.ConditionCheck),
      Delete: withTableName(item.Delete),
      Put: withTableName(item.Put),
      Update: withTableName(item.Update),
    }))
    logDb('DB.transaction', itemsWithTable)

    try {
      await this.docClient.send(
        new TransactWriteItemsCommand({
          TransactItems: itemsWithTable,
        })
      )
    } catch (err) {
      if (isTransactionCanceled(err)) {
        console.error('❌ Transaction was canceled')

        const reasons = err.CancellationReasons
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
      throw err
    }
  }

  async documentTransaction(items: NonNullable<TransactWriteCommandInput['TransactItems']>) {
    const transactItems: NonNullable<TransactWriteCommandInput['TransactItems']> = items.map((item) => {
      const withNormalizedTable = <T extends { TableName?: string }>(
        operation: T | undefined
      ): (T & { TableName: string }) | undefined => {
        if (!operation) return undefined
        if (!operation.TableName) throw new Error('DynamoDB transaction operation is missing TableName')
        return { ...operation, TableName: fromSamLocalTable(operation.TableName) }
      }

      return {
        ConditionCheck: withNormalizedTable(item.ConditionCheck),
        Delete: withNormalizedTable(item.Delete),
        Put: withNormalizedTable(item.Put),
        Update: withNormalizedTable(item.Update),
      }
    })
    logDb('DB.documentTransaction', transactItems)
    return this.docClient.send(new TransactWriteCommand({ TransactItems: transactItems }))
  }
}
