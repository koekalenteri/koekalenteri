import type { EmailTemplateId, JsonRegistration } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

import { registrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'

const mockDynamoDB: jest.Mocked<CustomDynamoClient> = {
  write: jest.fn(),
  // @ts-expect-error types don't quite match
  query: jest.fn(),
  update: jest.fn(),
  // @ts-expect-error types don't quite match
  read: jest.fn(),
  delete: jest.fn(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

const { getLastEmailInfo, findExistingRegistrationToEventForDog } = await import('./registration')

describe('registration', () => {
  describe('getLastEmailInfo', () => {
    const reg = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[6]))
    const date = '2024-08-08T08:32:00.000Z'

    it.each<[EmailTemplateId, string]>([
      ['access', `access-name ${date}`],
      ['invitation', `invitation-name ${date}`],
      ['picked', `picked-name ${date}`],
      ['receipt', `receipt-name ${date}`],
      ['refund', `refund-name ${date}`],
      ['registration', `registration-name ${date}`],
      ['reserve', `reserve-name (#${reg.group.number}) ${date}`],
    ])('should do blah', (templateId, expected) => {
      expect(getLastEmailInfo(templateId, `${templateId}-name`, reg, date)).toEqual(expected)
    })

    it('should print "?" in place of missing number for reserve', () => {
      expect(getLastEmailInfo('reserve', 'name', {} as JsonRegistration, date)).toEqual(`name (#?) ${date}`)
    })
  })

  describe('findExistingRegistrationToEventForDog', () => {
    it('should return undefined when dog is not found in existing registrations', async () => {
      mockDynamoDB.query.mockResolvedValueOnce([])

      expect(await findExistingRegistrationToEventForDog('event-id', 'reg-no')).toEqual(undefined)
    })

    it('should return the existing registration when dong is already registered', async () => {
      mockDynamoDB.query.mockResolvedValueOnce(registrationsToEventWithParticipantsInvited)
      const reg = registrationsToEventWithParticipantsInvited[0]

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo)).toEqual(reg)
    })
  })
})
