import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { defaultJSONHeaders } from "./headers";
import { constructAPIGwEvent, createAWSError } from "./helpers";

export const genericReadAllTest = (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) =>
  (): void => {
    let scanSpy: jest.SpyInstance;

    beforeAll(() => {
      scanSpy = jest.spyOn(DocumentClient.prototype, 'scan');
    });

    afterAll(() => {
      scanSpy.mockRestore();
    });

    it('should return mocked data', async () => {
      const items = [{ id: 'id1' }, { id: 'id2' }];

      scanSpy.mockReturnValue({
        promise: () => Promise.resolve({ Items: items })
      });

      const event = constructAPIGwEvent({}, { method: 'GET' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(items)
      });
    });

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error');
      scanSpy.mockImplementation(() => {
        throw error;
      });

      const event = constructAPIGwEvent({}, { method: 'GET' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error)
      });
    });

    it('should catch Error', async () => {
      const error = new Error('Test error');
      scanSpy.mockImplementation(() => {
        throw error;
      });

      const event = constructAPIGwEvent({}, { method: 'GET' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error)
      });
    });
  };


export const genericReadTest = (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) =>
  (): void => {
    let getSpy: jest.SpyInstance;

    beforeAll(() => {
      getSpy = jest.spyOn(DocumentClient.prototype, 'get');
    });

    afterAll(() => {
      getSpy.mockRestore();
    });

    it('should return mocked data', async () => {
      const item = { id: 'id1' };

      getSpy.mockReturnValue({
        promise: () => Promise.resolve({ Item: item })
      });

      const event = constructAPIGwEvent({}, { method: 'GET', pathParameters: { id: 'id1' } });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(item)
      });
    });

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error');
      getSpy.mockImplementation(() => {
        throw error;
      });

      const event = constructAPIGwEvent({}, { method: 'GET' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error)
      });
    });

    it('should catch Error', async () => {
      const error = new Error('Test error');
      getSpy.mockImplementation(() => {
        throw error;
      });

      const event = constructAPIGwEvent({}, { method: 'GET' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error)
      });
    });
  };

export const genericWriteTest = (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) =>
  (): void => {
    let putSpy: jest.SpyInstance;

    beforeAll(() => {
      putSpy = jest.spyOn(DocumentClient.prototype, 'put');
    });

    afterAll(() => {
      putSpy.mockRestore();
    });

    it('should return put data', async () => {
      let item;

      putSpy.mockImplementation((params) => {
        item = params.Item;
        return {
          promise: () => Promise.resolve()
        }
      });

      const event = constructAPIGwEvent({}, { method: 'PUT', username: 'TEST' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(item)
      });
      const data = JSON.parse(result.body);
      // compare only date part of timestamps (to avoid timing issues in tests)
      const timestamp = new Date().toISOString().substr(0, 10);
      expect(data.createdBy).toEqual('TEST');
      expect(data.createdAt.substr(0, 10)).toEqual(timestamp);
      expect(data.modifiedBy).toEqual('TEST');
      expect(data.modifiedAt.substr(0, 10)).toEqual(timestamp);
    });

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error');
      putSpy.mockImplementation(() => {
        throw error;
      });

      const event = constructAPIGwEvent({}, { method: 'PUT', username: 'TEST' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error)
      });
    });

    it('should catch Error', async () => {
      const error = new Error('Test error');
      putSpy.mockImplementation(() => {
        throw error;
      });

      const event = constructAPIGwEvent({}, { method: 'PUT', username: 'TEST' });
      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error)
      });
    });
  };
