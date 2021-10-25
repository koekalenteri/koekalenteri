// Create a DocumentClient that represents the query to add an item
import DynamoDB, { AttributeMap, ItemList } from 'aws-sdk/clients/dynamodb';
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service';

export default class CustomDynamoClient {
  table: string;
  docClient: DynamoDB.DocumentClient;

  constructor() {
    const options: ServiceConfigurationOptions = {};

    this.table = process.env.TABLE_NAME || "";

    if (process.env.AWS_SAM_LOCAL) {
      // Override endpoint when in local development
      options.endpoint = 'http://dynamodb:8000'

      // sam local does not provide proper table name as env variable
      // EventTable => event-table
      this.table = this.table.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase();

      console.info('SAM LOCAL DynamoDB: endpoint=' + options.endpoint + ', table: ' + this.table);
    }

    this.docClient = new DynamoDB.DocumentClient(options);
  }

  async readAll(): Promise<ItemList | undefined> {
    console.log('readAll: ' + this.table);
    // TODO should this be improved with a query? Or create a query version of this?
    const data = await this.docClient.scan({ TableName: this.table }).promise();
    return data.Items;
  }

  async read(id: unknown): Promise<AttributeMap | undefined> {
    const params = {
      TableName : this.table,
      Key: { id: id },
    };
    const data = await this.docClient.get(params).promise();
    return data.Item;
  }

  async write(Item: Record<string, unknown>): Promise<unknown> {
    const params = {
      TableName: this.table,
      Item,
    };

    return await this.docClient.put(params).promise();
  }
}
