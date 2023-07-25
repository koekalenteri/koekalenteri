import { jest } from '@jest/globals'
import AWS, { AWSError, Request } from 'aws-sdk'
import { PutItemInput, PutItemOutput, ScanInput, ScanOutput } from 'aws-sdk/clients/dynamodb'

import { genericReadAllTest } from '../test-utils/genericTests'
import { constructAPIGwEvent } from '../test-utils/helpers'

const { getEventTypesHandler, putEventTypeHandler } = await import('./eventType')

describe('getEventTypesHandler (generic)', genericReadAllTest(getEventTypesHandler))

describe('putEventTypeHandler', function () {
  const putSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'put')
  const getSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'get')
  const scanSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'scan')
  const querySpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'query')
  const updateSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'update')

  beforeAll(() => {
    process.env.JUDGE_TABLE_NAME = 'judge'
    process.env.OFFICIAL_TABLE_NAME = 'official'
  })

  afterAll(() => {
    putSpy.mockRestore()
    getSpy.mockRestore()
    scanSpy.mockRestore()
    querySpy.mockRestore()
    updateSpy.mockRestore()
  })

  describe('when eventType is disabled', function () {
    it('should delete judges and officials with no enabled eventTypes', async () => {
      const deleteCounts: Record<string, number> = {
        judge: 0,
        official: 0,
      }
      putSpy.mockImplementation((params: PutItemInput) => {
        if (params.Item.deletedAt) {
          deleteCounts[params.TableName as string]++
        }
        return {
          promise: () => Promise.resolve({}),
        } as Request<PutItemOutput, AWSError>
      })
      scanSpy.mockImplementation((params: ScanInput) => {
        const result: Record<string, unknown[]> = {
          '': [
            { eventType: 'TEST', active: false },
            { eventType: 'Active', active: true },
          ],
          judge: [
            { id: 1, eventTypes: ['TEST'] },
            { id: 2, eventTypes: ['TEST', 'Active'] },
            { id: 3, eventTypes: ['Active'] },
          ],
          official: [
            { id: 21, eventTypes: ['TEST'] },
            { id: 22, eventTypes: ['TEST', 'Active'] },
            { id: 33, eventTypes: ['Active'] },
          ],
        }
        console.log(params.TableName, result[params.TableName as string])
        return {
          promise: () =>
            Promise.resolve({
              Items: result[params.TableName as string] || [],
            }),
        } as Request<ScanOutput, AWSError>
      })

      const event = constructAPIGwEvent(
        { id: 111, eventType: 'TEST', active: false },
        { method: 'POST', username: 'TEST' }
      )
      const result = await putEventTypeHandler(event)
      expect(result.statusCode).toEqual(200)
      expect(deleteCounts.judge).toEqual(1)
      expect(deleteCounts.official).toEqual(1)
    })
  })
})
