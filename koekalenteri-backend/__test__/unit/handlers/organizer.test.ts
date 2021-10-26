import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { constructAPIGwEvent, createAWSError } from "../../utils/helpers";
import { getOrganizersHandler } from '../../../src/handlers/organizer';

describe('Test getOrganizersHandler', () => {
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
    const result = await getOrganizersHandler(event);

    expect(result).toEqual({
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(items)
    });
  });

  it('should catch error', async () => {
    const error = createAWSError(500, 'Test error');
    scanSpy.mockImplementation(() => {
      throw error;
    });

    const event = constructAPIGwEvent({}, { method: 'GET' });
    const result = await getOrganizersHandler(event);

    expect(result).toEqual({
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(error)
    });
  });
});
