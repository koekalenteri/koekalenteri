import { jest } from '@jest/globals'
import AWS from 'aws-sdk'

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
  let putSpy: any
  let getSpy: any
  let querySpy: any
  let updateSpy: any

  beforeAll(() => {
    putSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'put')
    getSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'get')
    querySpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'query')
    updateSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'update')
  })

  afterAll(() => {
    putSpy.mockRestore()
    getSpy.mockRestore()
    querySpy.mockRestore()
    updateSpy.mockRestore()
  })

  it('should return put data', async () => {
    let item

    putSpy.mockImplementation((params: any) => {
      item = params.Item
      return {
        promise: () => Promise.resolve(),
      }
    })
    getSpy.mockImplementation(() => ({ promise: () => Promise.resolve({ Item: {} }) }))
    querySpy.mockImplementation(() => ({ promise: () => Promise.resolve({ Items: [] }) }))
    updateSpy.mockImplementation(() => ({ promise: () => Promise.resolve() }))

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
