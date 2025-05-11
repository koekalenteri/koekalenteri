// Create a DocumentClient that represents the query to add an item

import AWS from 'aws-sdk'

function fromSamLocalTable(table: string) {
  // sam local does not provide proper table name as env variable
  // EventTable => event-table
  return table.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase()
}

export default class CustomDynamoClient {
  table: string
  docClient: AWS.DynamoDB.DocumentClient

  constructor(tableName: string) {
    const options: AWS.DynamoDB.DocumentClient.DocumentClientOptions & AWS.DynamoDB.Types.ClientConfiguration = {}

    this.table = fromSamLocalTable(tableName)

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000'

      console.info('SAM LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table)
    }

    this.docClient = new AWS.DynamoDB.DocumentClient(options)
  }

  async readAll<T extends object>(
    table?: string,
    filterExpression?: string,
    expressionAttributeValues?: AWS.DynamoDB.DocumentClient.ExpressionAttributeValueMap,
    expressionAttributeNames?: AWS.DynamoDB.DocumentClient.ExpressionAttributeNameMap
  ): Promise<T[] | undefined> {
    const params: AWS.DynamoDB.DocumentClient.ScanInput = {
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
    const data = await this.docClient.scan(params).promise()

    return data.Items as T[]
  }

  async read<T extends object>(
    key: Record<string, number | string | undefined> | null,
    table?: string
  ): Promise<T | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provoded, returning undefined')
      return
    }
    const params = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
    }
    console.log('DB.get', params)
    const data = await this.docClient.get(params).promise()
    return data.Item as T
  }

  async query<T extends object>(
    key: AWS.DynamoDB.DocumentClient.KeyExpression,
    values: AWS.DynamoDB.DocumentClient.ExpressionAttributeValueMap,
    table?: string,
    index?: string,
    names?: AWS.DynamoDB.DocumentClient.ExpressionAttributeNameMap,
    forward?: boolean,
    limit?: number,
    filterExpression?: string
  ): Promise<T[] | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.query: no key provided, returning undefined')
      return
    }
    const params: AWS.DynamoDB.DocumentClient.QueryInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      IndexName: index,
      KeyConditionExpression: key,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ScanIndexForward: forward,
      Limit: limit,
      FilterExpression: filterExpression,
    }
    console.log('DB.query', params)
    const data = await this.docClient.query(params).promise()
    return data.Items as T[]
  }

  async write<T extends object>(Item: T, table?: string): Promise<unknown> {
    const params = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Item,
    }
    console.log('DB.write', params)
    return this.docClient.put(params).promise()
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
      const params = {
        RequestItems: {
          [tableName]: chunk,
        },
      }
      console.log('DB.batchWrite', params)
      const result = await this.docClient.batchWrite(params).promise()
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
    key: AWS.DynamoDB.DocumentClient.Key,
    updates: {
      set?: Record<string, any>
      add?: Record<string, any>
    },
    table?: string,
    returnValues?: AWS.DynamoDB.DocumentClient.ReturnValue
  ) {
    // Initialize expression parts and attribute maps
    const expressionParts: string[] = []
    const names: Record<string, string> = {}
    const values: Record<string, any> = {}

    // Process SET operations
    if (updates.set && Object.keys(updates.set).length > 0) {
      const setParts: string[] = []

      for (const [field, value] of Object.entries(updates.set)) {
        const nameKey = `#${field}`
        const valueKey = `:${field}`

        names[nameKey] = field
        values[valueKey] = value

        setParts.push(`${nameKey} = ${valueKey}`)
      }

      if (setParts.length > 0) {
        expressionParts.push(`SET ${setParts.join(', ')}`)
      }
    }

    // Process ADD operations
    if (updates.add && Object.keys(updates.add).length > 0) {
      const addParts: string[] = []

      for (const [field, value] of Object.entries(updates.add)) {
        const nameKey = `#${field}`
        const valueKey = `:${field}`

        // If the field is already in names from SET, use a different key for ADD
        if (names[nameKey]) {
          const addNameKey = `#${field}_add`
          const addValueKey = `:${field}_add`

          names[addNameKey] = field
          values[addValueKey] = value

          addParts.push(`${addNameKey} ${addValueKey}`)
        } else {
          names[nameKey] = field
          values[valueKey] = value

          addParts.push(`${nameKey} ${valueKey}`)
        }
      }

      if (addParts.length > 0) {
        expressionParts.push(`ADD ${addParts.join(', ')}`)
      }
    }

    // If no operations were provided, throw an error
    if (expressionParts.length === 0) {
      throw new Error('No update operations provided')
    }

    // Combine all expression parts
    const updateExpression = expressionParts.join(' ')

    // Create params object for the update operation
    const params: AWS.DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }

    // Add ReturnValues if provided
    if (returnValues) {
      params.ReturnValues = returnValues
    }

    console.log('DB.update', params)
    return this.docClient.update(params).promise()
  }

  async delete<T extends object>(
    key: Record<string, number | string | undefined> | null,
    table?: string
  ): Promise<boolean> {
    if (!key) {
      console.warn('CustomDynamoClient.delete: no key provoded, returning false')
      return false
    }
    const params = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
    }
    console.log('DB.delete', params)

    const data = await this.docClient.delete(params).promise()
    return !data.$response.error
  }
}
