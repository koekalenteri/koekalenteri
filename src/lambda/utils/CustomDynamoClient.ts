// Create a DocumentClient that represents the query to add an item
import type { UpdateExpression } from 'aws-sdk/clients/dynamodb.js'
import type { JsonObject } from '../../types'

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

    this.table = tableName

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000'

      this.table = fromSamLocalTable(this.table)

      console.info('SAM LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table)
    }

    this.docClient = new AWS.DynamoDB.DocumentClient(options)
  }

  async readAll<T extends object>(table?: string): Promise<T[] | undefined> {
    // TODO should this be improved with a query? Or create a query version of this?
    const params = {
      TableName: table ? fromSamLocalTable(table) : this.table,
    }
    console.log('DB.scan', params)
    const data = await this.docClient.scan(params).promise()
    return data.Items?.filter((item: JsonObject) => !item.deletedAt) as T[]
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
    limit?: number
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

  async update<T extends object>(
    key: AWS.DynamoDB.DocumentClient.Key,
    expression: UpdateExpression,
    names: { [key: string]: string },
    values: T,
    table?: string
  ) {
    const params: AWS.DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
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
