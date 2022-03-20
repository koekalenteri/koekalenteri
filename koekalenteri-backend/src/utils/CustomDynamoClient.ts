// Create a DocumentClient that represents the query to add an item
import { APIGatewayProxyEventPathParameters } from 'aws-lambda';
import DynamoDB, { ItemList, UpdateExpression } from 'aws-sdk/clients/dynamodb';
import { JsonObject } from 'koekalenteri-shared/model';

function fromSamLocalTable(table: string) {
  // sam local does not provide proper table name as env variable
  // EventTable => event-table
  return table.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase();
}

export default class CustomDynamoClient {
  table: string;
  docClient: DynamoDB.DocumentClient;

  constructor() {
    const options: DynamoDB.DocumentClient.DocumentClientOptions & DynamoDB.Types.ClientConfiguration = {};

    this.table = process.env.TABLE_NAME || "";

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000';

      this.table = fromSamLocalTable(this.table);

      console.info('SAM LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table);
    }

    this.docClient = new DynamoDB.DocumentClient(options);
  }

  async readAll(): Promise<ItemList | undefined> {
    // TODO should this be improved with a query? Or create a query version of this?
    const data = await this.docClient.scan({ TableName: this.table }).promise();
    return data.Items?.filter(item => !item.deletedAt);
  }

  async read<T>(key: APIGatewayProxyEventPathParameters | null, table?: string): Promise<T | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provoded, returning undefined');
      return;
    }
    const params = {
      TableName : table ? fromSamLocalTable(table) : this.table,
      Key: key,
    };
    const data = await this.docClient.get(params).promise();
    return data.Item as T;
  }

  async query<T>(key: DynamoDB.DocumentClient.KeyExpression, values: DynamoDB.DocumentClient.ExpressionAttributeValueMap): Promise<T[] | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provoded, returning undefined');
      return;
    }
    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName : this.table,
      KeyConditionExpression: key,
      ExpressionAttributeValues: values
    };
    const data = await this.docClient.query(params).promise();
    return data.Items as T[];
  }

  async write(Item: Record<string, unknown>): Promise<unknown> {
    const params = {
      TableName: this.table,
      Item,
    };
    return this.docClient.put(params).promise();
  }

  async update(key: DynamoDB.DocumentClient.Key, expression: UpdateExpression, values: JsonObject, table?: string) {
    const params: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: key,
      UpdateExpression: expression,
      ExpressionAttributeValues: values
    };
    return this.docClient.update(params).promise();
  }
}
