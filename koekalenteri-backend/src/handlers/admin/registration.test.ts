import { jest } from '@jest/globals'
import AWS from 'aws-sdk'
import { JsonRegistrationGroupInfo } from 'koekalenteri-shared/model'

import { defaultJSONHeaders } from '../../test-utils/headers'
import { constructAPIGwEvent, createAWSError } from '../../test-utils/helpers'

import { fixGroups, getRegistrationsHandler, putRegistrationGroupsHandler } from './registration'

// TODO: proper mocks with aws-sdk v3

describe('admin/registration', () => {
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

  // describe('Test getRegistrationsHandler', genericQueryTest(getRegistrationsHandler))
  describe('getRegistrationsHandler', () => {
    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error')
      querySpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent({}, { method: 'GET' })
      const result = await getRegistrationsHandler(event)

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
      const result = await getRegistrationsHandler(event)

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })
  })

  xdescribe('putRegistrationGroupsHandler', () => {
    const testGroups: JsonRegistrationGroupInfo[] = [
      {
        id: 'test-id',
        eventId: 'test-event-id',
        group: { date: '2022-01-01T00:00', time: 'ip', key: 'some-group', number: 4 },
      },
    ]

    it('should call update', async () => {
      const event = constructAPIGwEvent(testGroups, { method: 'POST', username: 'TEST' })
      await putRegistrationGroupsHandler(event)

      expect(updateSpy).toHaveBeenCalledWith({
        ExpressionAttributeNames: {
          '#cancelled': 'cancelled',
          '#grp': 'group',
        },
        ExpressionAttributeValues: {
          ':cancelled': false,
          ':value': { date: '2022-01-01T00:00', time: 'ip', key: 'some-group', number: 4 },
        },
        Key: { eventId: 'test-event-id', id: 'test-id' },
        TableName: '',
        UpdateExpression: 'set #grp = :value, #cancelled = :cancelled',
      })
    })

    it('should call update when cancelled', async () => {
      const event = constructAPIGwEvent(
        [
          {
            id: 'test-id',
            eventId: 'test-event-id',
            group: { date: '2022-01-01T00:00', time: 'ip', key: 'cancelled', number: 4 },
            cancelled: true,
          },
        ],
        { method: 'POST', username: 'TEST' }
      )
      await putRegistrationGroupsHandler(event)

      expect(updateSpy).toHaveBeenCalledWith({
        ExpressionAttributeNames: {
          '#cancelled': 'cancelled',
          '#grp': 'group',
        },
        ExpressionAttributeValues: {
          ':cancelled': true,
          ':value': { date: '2022-01-01T00:00', time: 'ip', key: 'cancelled', number: 4 },
        },
        Key: { eventId: 'test-event-id', id: 'test-id' },
        TableName: '',
        UpdateExpression: 'set #grp = :value, #cancelled = :cancelled',
      })
    })

    it('should catch AWSError', async () => {
      const error = createAWSError(500, 'Test error')
      updateSpy.mockImplementation(() => {
        throw error
      })

      const event = constructAPIGwEvent(testGroups, { method: 'POST', username: 'TEST' })
      const result = await putRegistrationGroupsHandler(event)

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

      const event = constructAPIGwEvent(testGroups, { method: 'POST', username: 'TEST' })
      const result = await putRegistrationGroupsHandler(event)

      expect(result).toEqual({
        statusCode: 501,
        headers: defaultJSONHeaders,
        body: JSON.stringify(error),
      })
    })
  })

  xdescribe('fixGroups', () => {
    it('should do nothing when groups exist', async () => {
      expect(fixGroups([{ id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'test', number: 0 } }])).toEqual([
        { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'test', number: 0 } },
      ])
    })

    it('should add groups to recerve with proper numbering', async () => {
      expect(await fixGroups([{ id: 'test-reg-id', eventId: 'test-evet-id' }])).toEqual([
        { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'reserve', number: 1 } },
      ])
      expect(updateSpy).not.toHaveBeenCalled()

      expect(
        await fixGroups([
          { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'test', number: 4 } },
          { id: 'test-reg-id2', eventId: 'test-evet-id' },
          { id: 'test-reg-id3', eventId: 'test-evet-id' },
        ])
      ).toEqual([
        { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'test', number: 4 } },
        { id: 'test-reg-id2', eventId: 'test-evet-id', group: { key: 'reserve', number: 1 } },
        { id: 'test-reg-id3', eventId: 'test-evet-id', group: { key: 'reserve', number: 2 } },
      ])
      expect(updateSpy).toHaveBeenCalledTimes(2)

      expect(
        await fixGroups([
          { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'reserve', number: 1 } },
          { id: 'test-reg-id2', eventId: 'test-evet-id' },
          { id: 'test-reg-id3', eventId: 'test-evet-id' },
        ])
      ).toEqual([
        { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'reserve', number: 1 } },
        { id: 'test-reg-id2', eventId: 'test-evet-id', group: { key: 'reserve', number: 2 } },
        { id: 'test-reg-id3', eventId: 'test-evet-id', group: { key: 'reserve', number: 3 } },
      ])
      expect(updateSpy).toHaveBeenCalledTimes(4)

      expect(
        await fixGroups([
          { id: 'test-reg-id-1', eventId: 'test-evet-id' },
          { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'reserve', number: 1 } },
          { id: 'test-reg-id-2', eventId: 'test-evet-id' },
          { id: 'test-reg-id-3', eventId: 'test-evet-id' },
        ])
      ).toEqual([
        { id: 'test-reg-id-1', eventId: 'test-evet-id', group: { key: 'reserve', number: 2 } },
        { id: 'test-reg-id', eventId: 'test-evet-id', group: { key: 'reserve', number: 1 } },
        { id: 'test-reg-id-2', eventId: 'test-evet-id', group: { key: 'reserve', number: 3 } },
        { id: 'test-reg-id-3', eventId: 'test-evet-id', group: { key: 'reserve', number: 4 } },
      ])
      expect(updateSpy).toHaveBeenCalledTimes(7)
    })
  })
})
