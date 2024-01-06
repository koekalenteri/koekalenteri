import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { AttributeMap, PutItemInput, PutItemOutput, ScanOutput } from 'aws-sdk/clients/dynamodb'
import type { PromiseResult, Request } from 'aws-sdk/lib/request'
import type { User } from '../../types'

import { jest } from '@jest/globals'
import AWS from 'aws-sdk'

import { defaultJSONHeaders } from './headers'
import { constructAPIGwEvent, createAWSError } from './helpers'

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest
    .fn<(event: APIGatewayProxyEvent) => Promise<User | null | undefined>>()
    .mockResolvedValue({ id: 'userid', name: 'test user', email: 'mail@example.com', admin: true }),
  getOrigin: jest.fn<(event: APIGatewayProxyEvent) => string | undefined>().mockReturnValue('localhost'),
  getAndUpdateUserByEmail: jest.fn(),
}))

export const genericReadAllTest =
  (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) => (): void => {
    const scanSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'scan')

    afterAll(() => {
      scanSpy.mockRestore()
    })

    it('should return mocked data', async () => {
      const items = [{ id: 'id1' }, { id: 'id2' }]

      scanSpy.mockReturnValue({
        promise: () =>
          Promise.resolve({
            Items: items,
          } as unknown as PromiseResult<ScanOutput, AWSError>),
      } as AWS.Request<AWS.DynamoDB.DocumentClient.ScanOutput, AWS.AWSError>)

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(items),
      })
    })

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error')
      scanSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })

    it('should catch Error', async () => {
      const error = new Error('Test error')
      scanSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })
  }

export const genericQueryTest =
  (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>, mockData?: AttributeMap[]) => (): void => {
    const querySpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'query')

    afterAll(() => {
      querySpy.mockRestore()
    })

    it('should return mocked data', async () => {
      const items = mockData ?? [{ id: 'id1' }, { id: 'id2' }]

      querySpy.mockReturnValue({
        promise: () =>
          Promise.resolve({
            Items: items,
          } as unknown as PromiseResult<ScanOutput, AWSError>),
      } as AWS.Request<AWS.DynamoDB.DocumentClient.ScanOutput, AWS.AWSError>)

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(items),
      })
    })

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error')
      querySpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })

    it('should catch Error', async () => {
      const error = new Error('Test error')
      querySpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })
  }

export const genericReadTest =
  (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) => (): void => {
    const getSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'get')

    afterAll(() => {
      getSpy.mockRestore()
    })

    it('should return mocked data', async () => {
      const item = { id: 'id1' }

      getSpy.mockReturnValue({
        promise: () => Promise.resolve({ Item: item } as unknown as PromiseResult<ScanOutput, AWSError>),
      } as AWS.Request<AWS.DynamoDB.DocumentClient.ScanOutput, AWS.AWSError>)

      const event = constructAPIGwEvent({}, { method: 'GET', pathParameters: { id: 'id1' } })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(item),
      })
    })

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error')
      getSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })

    it('should catch Error', async () => {
      const error = new Error('Test error')
      getSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })
  }

export const genericWriteTest =
  (handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) => (): void => {
    const putSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'put')

    afterAll(() => {
      putSpy.mockRestore()
    })

    it('should return put data', async () => {
      let item

      putSpy.mockImplementation((params: PutItemInput) => {
        item = params.Item
        return {
          promise: () => Promise.resolve(),
        } as unknown as Request<PutItemOutput, AWSError>
      })

      const event = constructAPIGwEvent({}, { method: 'POST', username: 'TEST' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 200,
        headers: defaultJSONHeaders,
        body: JSON.stringify(item),
      })
      const data = JSON.parse(result.body)
      // compare only date part of timestamps (to avoid timing issues in tests)
      const timestamp = new Date().toISOString().slice(0, 10)
      expect(data.createdBy).toEqual('test user')
      expect(data.createdAt.slice(0, 10)).toEqual(timestamp)
      expect(data.modifiedBy).toEqual('test user')
      expect(data.modifiedAt.slice(0, 10)).toEqual(timestamp)
    })

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error')
      putSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'POST', username: 'TEST' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 500,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })

    it('should catch Error', async () => {
      const error = new Error('Test error')
      putSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'POST', username: 'TEST' })
      const result = await handler(event)

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })
  }
