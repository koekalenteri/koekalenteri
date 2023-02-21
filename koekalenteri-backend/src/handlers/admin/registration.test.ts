import {jest} from '@jest/globals'
import AWS from 'aws-sdk'

import { genericQueryTest } from "../../test-utils/genericTests"
import { defaultJSONHeaders } from '../../test-utils/headers'
import { constructAPIGwEvent, createAWSError } from '../../test-utils/helpers'

import { getRegistrationsHandler, putRegistrationGroupHandler } from "./registration"


describe('Test getRegistrationsHandler (generic)', genericQueryTest(getRegistrationsHandler))

describe('putRegistrationGroupHandler', () => {
  const testObject = {id: 'test-id', eventId: 'test-event-id', group: {date: '2022-01-01T00:00', time: 'ip'}}
  let updateSpy: any

  beforeAll(() => {
    updateSpy = jest.spyOn(AWS.DynamoDB.DocumentClient.prototype, 'update')
  })

  afterAll(() => {
    updateSpy.mockRestore()
  })

  it('should call update', async () => {
    const event = constructAPIGwEvent(testObject, { method: 'PUT', username: 'TEST' })
    await putRegistrationGroupHandler(event)

    expect(updateSpy).toHaveBeenCalled()
  })

  it('should catch AWSError', async () => {
    const error = createAWSError(500, 'Test error')
    updateSpy.mockImplementation(() => {
      throw error
    })

    const event = constructAPIGwEvent(testObject, { method: 'PUT', username: 'TEST' })
    const result = await putRegistrationGroupHandler(event)

    expect(result).toEqual({
      statusCode: 500,
      headers: defaultJSONHeaders,
      body: JSON.stringify(error),
    })
  })

  it('should catch Error', async () => {
    const error = new Error('Test error')
    updateSpy.mockImplementation(() => {
      throw error
    })

    const event = constructAPIGwEvent(testObject, { method: 'PUT', username: 'TEST' })
    const result = await putRegistrationGroupHandler(event)

    expect(result).toEqual({
      statusCode: 501,
      headers: defaultJSONHeaders,
      body: JSON.stringify(error),
    })
  })
})
