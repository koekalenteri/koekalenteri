// Create a DocumentClient that represents the query to add an item
import { APIGatewayProxyEventPathParameters } from 'aws-lambda';
import { DynamoDBClient, DynamoDBClientConfig, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { JsonObject } from 'shared';

function fromSamLocalTable(table: string) {
  // sam local does not provide proper table name as env variable
  // EventTable => event-table
  return table.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase();
}

export class CustomDynamoClient {
  table: string;
  client: DynamoDBClient;

  constructor() {
    const options: DynamoDBClientConfig = {};

    this.table = process.env.TABLE_NAME || "";

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000';

      this.table = fromSamLocalTable(this.table);

      console.info('SAM LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table);
    }

    this.client = new DynamoDBClient(options);
  }

  async readAll<T extends { [key: string]: any } & { deletedAt?: string }>(): Promise<T[] | undefined> {
    // TODO should this be improved with a query? Or create a query version of this?
    const command = new ScanCommand({ TableName: this.table });
    const data = await this.client.send(command);
    return data.Items && data.Items.map(i => unmarshall(i) as T).filter(item => !item.deletedAt);
  }

  async read<T extends { [key: string]: any}>(key: APIGatewayProxyEventPathParameters | null, table?: string): Promise<T | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provoded, returning undefined');
      return;
    }
    const command = new GetItemCommand({
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: marshall(key)
    });
    const data = await this.client.send(command);
    return data.Item && unmarshall(data.Item) as T;
  }

  async query<T>(key: string, values: JsonObject, table?: string): Promise<T[] | undefined> {
    if (!key) {
      console.warn('CustomDynamoClient.read: no key provoded, returning undefined');
      return;
    }
    const command = new QueryCommand({
      TableName: table ? fromSamLocalTable(table) : this.table,
      KeyConditionExpression: key,
      ExpressionAttributeValues: marshall(values)
    });
    const data = await this.client.send(command);
    return data.Items && data.Items.map(i => unmarshall(i)) as T[];
  }

  async write(item: Record<string, unknown>) {
    const command = new PutItemCommand({
      TableName: this.table,
      Item: marshall(item),
    });
    return this.client.send(command);
  }

  async update(key: JsonObject, expression: string, values: JsonObject, table?: string) {
    const command = new UpdateItemCommand({
      TableName: table ? fromSamLocalTable(table) : this.table,
      Key: marshall(key),
      UpdateExpression: expression,
      ExpressionAttributeValues: marshall(values)
    });
    return this.client.send(command);
  }
}
