import { jest } from '@jest/globals'
import AWS, { AWSError, Request } from 'aws-sdk'
import { GetItemOutput, PutItemInput, PutItemOutput, QueryOutput, UpdateItemOutput } from 'aws-sdk/clients/dynamodb'

import { defaultJSONHeaders } from '../test-utils/headers'
import { constructAPIGwEvent, createAWSError } from '../test-utils/helpers'

import { putRegistrationHandler } from './registration'

jest.mock('aws-sdk/clients/ses', () => {
  const mSES = {
    sendTemplatedEmail: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  }
  return jest.fn(() => mSES)
})

describe('putRegistrationHandler', function () {
  const putSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'put')
  const getSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'get')
  const querySpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'query')
  const updateSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'update')

  afterAll(() => {
    putSpy.mockRestore()
    getSpy.mockRestore()
    querySpy.mockRestore()
    updateSpy.mockRestore()
  })

  it('should return put data', async () => {
    let item

    putSpy.mockImplementation((params: PutItemInput) => {
      item = params.Item
      return {
        promise: () => Promise.resolve(),
      } as unknown as Request<PutItemOutput, AWSError>
    })
    getSpy.mockImplementation(
      () => ({ promise: () => Promise.resolve({ Item: {} }) }) as unknown as Request<GetItemOutput, AWSError>
    )
    querySpy.mockImplementation(
      () => ({ promise: () => Promise.resolve({ Items: [] }) }) as unknown as Request<QueryOutput, AWSError>
    )
    updateSpy.mockImplementation(
      () => ({ promise: () => Promise.resolve() }) as unknown as Request<UpdateItemOutput, AWSError>
    )

    const event = constructAPIGwEvent({}, { method: 'POST' })
    const result = await putRegistrationHandler(event)

    expect(result).toEqual({
      statusCode: 200,
      headers: defaultJSONHeaders,
      body: JSON.stringify(item),
    })
    const data = JSON.parse(result.body)
    // compare only date part of timestamps (to avoid timing issues in tests)
    const timestamp = new Date().toISOString().slice(0, 10)
    expect(data.createdBy).toEqual('anonymous')
    expect(data.createdAt.slice(0, 10)).toEqual(timestamp)
    expect(data.modifiedBy).toEqual('anonymous')
    expect(data.modifiedAt.slice(0, 10)).toEqual(timestamp)
  })

  it('should catch AWSError', async () => {
    const error = createAWSError(500, 'Test error')
    putSpy.mockImplementation(() => {
      throw error
    })

    const event = constructAPIGwEvent({}, { method: 'POST', username: 'TEST' })
    const result = await putRegistrationHandler(event)

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
    const result = await putRegistrationHandler(event)

    expect(result).toEqual({
      statusCode: 501,
      headers: defaultJSONHeaders,
      body: JSON.stringify(error),
    })
  })
})
