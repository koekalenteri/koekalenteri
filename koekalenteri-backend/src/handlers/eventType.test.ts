import type { AWSError, Request } from 'aws-sdk'
import type { PutItemInput, PutItemOutput, ScanInput, ScanOutput } from 'aws-sdk/clients/dynamodb'

import { jest } from '@jest/globals'
import AWS from 'aws-sdk'

import { genericReadAllTest } from '../test-utils/genericTests'
import { constructAPIGwEvent } from '../test-utils/helpers'

const { getEventTypesHandler, putEventTypeHandler } = await import('./eventType')

describe('getEventTypesHandler (generic)', genericReadAllTest(getEventTypesHandler))

describe('putEventTypeHandler', function () {
  let putSpy: jest.SpiedFunction<typeof AWS.DynamoDB.DocumentClient.prototype.put>
  let getSpy: jest.SpiedFunction<typeof AWS.DynamoDB.DocumentClient.prototype.get>
  let scanSpy: jest.SpiedFunction<typeof AWS.DynamoDB.DocumentClient.prototype.scan>
  let querySpy: jest.SpiedFunction<typeof AWS.DynamoDB.DocumentClient.prototype.query>
  let updateSpy: jest.SpiedFunction<typeof AWS.DynamoDB.DocumentClient.prototype.update>

  beforeAll(() => {
    process.env.JUDGE_TABLE_NAME = 'judge'
    process.env.OFFICIAL_TABLE_NAME = 'official'

    putSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'put')
    getSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'get')
    scanSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'scan')
    querySpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'query')
    updateSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'update')
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
