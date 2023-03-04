// Create a DocumentClient that represents the query to add an item
import AWS from 'aws-sdk'
import type { UpdateExpression } from 'aws-sdk/clients/dynamodb.js'
import { JsonObject } from 'koekalenteri-shared/model'

function fromSamLocalTable(table: string) {
  // sam local does not provide proper table name as env variable
  // EventTable => event-table
  return table.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase()
}

export default class CustomDynamoClient {
  table: string
  docClient: AWS.DynamoDB.DocumentClient

  constructor() {
    const options: AWS.DynamoDB.DocumentClient.DocumentClientOptions & AWS.DynamoDB.Types.ClientConfiguration = {}

    this.table = process.env.TABLE_NAME || ""

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000'

      this.table = fromSamLocalTable(this.table)

      console.info('SAM LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table)
    }

    this.docClient = new AWS.DynamoDB.DocumentClient(options)
  }

  async readAll<T>(table?: string): Promise<T[] | undefined> {
    // TODO should this be improved with a query? Or create a query version of this?
    const data = await this.docClient.scan({
      TableName: table ? fromSamLocalTable(table) : this.table,
    }).promise()
    return data.Items?.filter((item: JsonObject) => !item.deletedAt) as T[]
  }

  async read<T>(key: Record<string, number | string | undefined> | null, table?: string): Promise<T | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provoded, returning undefined')
      return
    }
    const params = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
    }
    const data = await this.docClient.get(params).promise()
    return data.Item as T
  }

  async query<T>(key: AWS.DynamoDB.DocumentClient.KeyExpression, values: AWS.DynamoDB.DocumentClient.ExpressionAttributeValueMap): Promise<T[] | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.query: no key provided, returning undefined')
      return
    }
    const params: AWS.DynamoDB.DocumentClient.QueryInput = {
      TableName: this.table,
      KeyConditionExpression: key,
      ExpressionAttributeValues: values,
    }
    const data = await this.docClient.query(params).promise()
    return data.Items as T[]
  }

  async write(Item: object, table?: string): Promise<unknown> {
    const params = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Item,
    }
    return this.docClient.put(params).promise()
  }

  async update(key: AWS.DynamoDB.DocumentClient.Key, expression: UpdateExpression, names: {[key: string]: string}, values: JsonObject, table?: string) {
    const params: AWS.DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }
    return this.docClient.update(params).promise()
  }
}
