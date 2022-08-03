import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { getEventsHandler, getEventHandler, putEventHandler, putRegistrationHandler } from '../../../src/handlers/event';
import { genericReadAllTest, genericReadTest, genericWriteTest } from '../../utils/genericTests';
import { defaultJSONHeaders } from '../../utils/headers';
import { constructAPIGwEvent, createAWSError } from '../../utils/helpers';

jest.mock('aws-sdk/clients/ses', () => {
  const mSES = {
    sendTemplatedEmail: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  };
  return jest.fn(() => mSES);
});

describe('Test getEventsHandler (generic)', genericReadAllTest(getEventsHandler));
describe('Test getEventHandler (generic)', genericReadTest(getEventHandler));
describe('Test putEventHandler (generic)', genericWriteTest(putEventHandler));

describe('putRegistrationHandler', function() {
  let putSpy: jest.SpyInstance;
  let getSpy: jest.SpyInstance;
  let querySpy: jest.SpyInstance;
  let updateSpy: jest.SpyInstance;

  beforeAll(() => {
    putSpy = jest.spyOn(DocumentClient.prototype, 'put');
    getSpy = jest.spyOn(DocumentClient.prototype, 'get');
    querySpy = jest.spyOn(DocumentClient.prototype, 'query');
    updateSpy = jest.spyOn(DocumentClient.prototype, 'update');
  });

  afterAll(() => {
    putSpy.mockRestore();
    getSpy.mockRestore();
    querySpy.mockRestore();
    updateSpy.mockRestore();
  });

  it('should return put data', async () => {
    let item;

    putSpy.mockImplementation((params) => {
      item = params.Item;
      return {
        promise: () => Promise.resolve()
      }
    });
    getSpy.mockImplementation(() => ({ promise: () => Promise.resolve({Item: {}}) }));
    querySpy.mockImplementation(() => ({ promise: () => Promise.resolve({Items: []}) }));
    updateSpy.mockImplementation(() => ({ promise: () => Promise.resolve() }));

    const event = constructAPIGwEvent({}, { method: 'PUT', username: 'TEST' });
    const result = await putRegistrationHandler(event);

    expect(result).toEqual({
      statusCode: 200,
      headers: defaultJSONHeaders,
      body: JSON.stringify(item)
    });
    const data = JSON.parse(result.body);
    // compare only date part of timestamps (to avoid timing issues in tests)
    const timestamp = new Date().toISOString().substring(0, 10);
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
    const result = await putRegistrationHandler(event);

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
    const result = await putRegistrationHandler(event);

    expect(result).toEqual({
      statusCode: 501,
      headers: defaultJSONHeaders,
      body: JSON.stringify(error)
    });
  });
});
