import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { getEventTypesHandler, putEventTypeHandler } from '../../../src/handlers/eventType';
import { genericReadAllTest } from '../../utils/genericTests';
import { constructAPIGwEvent } from '../../utils/helpers';

describe('getEventTypesHandler (generic)', genericReadAllTest(getEventTypesHandler));

describe('putEventTypeHandler', function() {
  let putSpy: jest.SpyInstance;
  let getSpy: jest.SpyInstance;
  let scanSpy: jest.SpyInstance;
  let querySpy: jest.SpyInstance;
  let updateSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.JUDGE_TABLE_NAME = 'judge';
    process.env.OFFICIAL_TABLE_NAME = 'official';

    putSpy = jest.spyOn(DocumentClient.prototype, 'put');
    getSpy = jest.spyOn(DocumentClient.prototype, 'get');
    scanSpy = jest.spyOn(DocumentClient.prototype, 'scan');
    querySpy = jest.spyOn(DocumentClient.prototype, 'query');
    updateSpy = jest.spyOn(DocumentClient.prototype, 'update');
  });

  afterAll(() => {
    putSpy.mockRestore();
    getSpy.mockRestore();
    scanSpy.mockRestore();
    querySpy.mockRestore();
    updateSpy.mockRestore();
  });

  describe('when eventType is disabled', function() {
    it('should delete judges and officials with no enabled eventTypes', async () => {
      const deleteCounts: Record<string, number> = {
        'judge': 0,
        'official' : 0
      }
      putSpy.mockImplementation((params) => {
        if (params.Item.deletedAt) {
          deleteCounts[params.TableName as string]++;
        }
        return {
          promise: () => Promise.resolve({})
        }
      });
      scanSpy.mockImplementation((params) => {
        const result: Record<string, unknown[]> = {
          '': [{eventType: 'TEST', active: false}, {eventType: 'Active', active: true}],
          'judge': [{id: 1, eventTypes: ['TEST']}, {id: 2, eventTypes: ['TEST', 'Active']}, {id: 3, eventTypes: ['Active']}],
          'official': [{ id: 21, eventTypes: ['TEST'] }, {id: 22, eventTypes: ['TEST', 'Active']}, {id: 33, eventTypes: ['Active']}]
        }
        console.log(params.TableName, result[params.TableName as string]);
        return {
          promise: () => Promise.resolve({
            Items: result[params.TableName as string] || []
          })
        }
      });

      const event = constructAPIGwEvent({id: 111, eventType: 'TEST', active: false}, { method: 'PUT', username: 'TEST' });
      const result = await putEventTypeHandler(event);
      expect(result.statusCode).toEqual(200);
      expect(deleteCounts.judge).toEqual(1);
      expect(deleteCounts.official).toEqual(1);
    });
  });
});
