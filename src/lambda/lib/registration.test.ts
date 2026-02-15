import type { EmailTemplateId, JsonRegistration } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { jest } from '@jest/globals'
import { eventWithALOClassInvited } from '../../__mockData__/events'
import {
  jsonRegistrationsToEventWithALOInvited,
  registrationsToEventWithParticipantsInvited,
} from '../../__mockData__/registrations'

const mockDynamoDB: jest.Mocked<CustomDynamoClient> = {
  delete: jest.fn(),
  // @ts-expect-error types don't quite match
  query: jest.fn(),
  // @ts-expect-error types don't quite match
  read: jest.fn(),
  update: jest.fn(),
  write: jest.fn(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

const mockSendTemplatedMail = jest.fn<any>()
const mockAudit = jest.fn()
const mockEmailTo = jest.fn()
const mockSESSend = jest.fn<any>()

jest.unstable_mockModule('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSESSend })),
  SendTemplatedEmailCommand: jest.fn(({ Destination, Template }) => [Destination.ToAddresses, Template]),
}))

jest.unstable_mockModule('./audit', () => ({
  audit: mockAudit,
  registrationAuditKey: jest
    .fn<any>()
    .mockImplementation((reg: { eventId: string; id: string }) => `${reg.eventId}:${reg.id}`),
}))

const {
  getLastEmailInfo,
  findClassesToMark,
  findExistingRegistrationToEventForDog,
  groupRegistrationsByClass,
  groupRegistrationsByClassAndGroup,
  sendTemplatedEmailToEventRegistrations,
} = await import('./registration')

describe('registration', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })
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

  describe('groupRegistrationsByClass', () => {
    it('should group registrations by class', () => {
      const registrations = [
        { class: 'ALO', id: '1' },
        { class: 'AVO', id: '2' },
        { class: 'ALO', id: '3' },
      ] as unknown as JsonRegistration[]

      const result = groupRegistrationsByClass(registrations)

      expect(Object.keys(result)).toEqual(['ALO', 'AVO'])
      expect(result.ALO.length).toBe(2)
      expect(result.AVO.length).toBe(1)
      expect(result.ALO).toContainEqual(expect.objectContaining({ id: '1' }))
      expect(result.ALO).toContainEqual(expect.objectContaining({ id: '3' }))
      expect(result.AVO).toContainEqual(expect.objectContaining({ id: '2' }))
    })

    it('should use eventType when class is not available', () => {
      const registrations = [
        { eventType: 'NOME', id: '1' },
        { class: 'AVO', id: '2' },
        { eventType: 'NOME', id: '3' },
      ] as unknown as JsonRegistration[]

      const result = groupRegistrationsByClass(registrations)

      expect(Object.keys(result)).toEqual(['NOME', 'AVO'])
      expect(result.NOME.length).toBe(2)
      expect(result.AVO.length).toBe(1)
    })

    it('should handle empty array', () => {
      const result = groupRegistrationsByClass([])
      expect(result).toEqual({})
    })
  })

  describe('groupRegistrationsByClassAndGroup', () => {
    it('should group registrations by class and group', () => {
      const registrationsByClass = {
        ALO: [
          { group: { key: 'group1' }, id: '1' },
          { group: { key: 'group2' }, id: '2' },
          { group: { key: 'group1' }, id: '3' },
        ],
        AVO: [{ group: { key: 'group3' }, id: '4' }],
      } as unknown as Record<string, JsonRegistration[]>

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(Object.keys(result)).toEqual(['ALO', 'AVO'])
      expect(Object.keys(result.ALO)).toEqual(['group1', 'group2'])
      expect(Object.keys(result.AVO)).toEqual(['group3'])
      expect(result.ALO.group1.length).toBe(2)
      expect(result.ALO.group2.length).toBe(1)
    })

    it('should skip registrations that are not in participant groups', () => {
      const registrationsByClass = {
        ALO: [
          { group: { key: 'group1' }, id: '1' },
          { group: { key: 'reserve' }, id: '2' },
          { group: { key: 'cancelled' }, id: '3' },
          { group: undefined, id: '4' },
        ],
      } as unknown as Record<string, JsonRegistration[]>

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(Object.keys(result.ALO)).toEqual(['group1'])
      expect(result.ALO.group1.length).toBe(1)
    })

    it('should handle empty input', () => {
      const result = groupRegistrationsByClassAndGroup({})
      expect(result).toEqual({})
    })
  })

  describe('findClassesToMark', () => {
    it('should find classes where all groups have received the message', () => {
      const registrationsByClassAndGroup = {
        ALO: {
          group1: [
            { id: '1', messagesSent: { invitation: true } },
            { id: '2', messagesSent: { invitation: true } },
          ],
          group2: [{ id: '3', messagesSent: { invitation: true } }],
        },
        AVO: {
          group3: [{ id: '4', messagesSent: { invitation: true } }],
        },
        VOI: {
          group4: [{ id: '5', messagesSent: { invitation: false } }],
        },
      } as unknown as Record<string, Record<string, JsonRegistration[]>>

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual(['ALO', 'AVO'])
    })

    it('should not include classes with empty groups', () => {
      const registrationsByClassAndGroup = {
        ALO: {},
        AVO: {
          group1: [{ id: '1', messagesSent: { invitation: true } }],
        },
      } as unknown as Record<string, Record<string, JsonRegistration[]>>

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual(['AVO'])
    })

    it('should handle missing messagesSent property', () => {
      const registrationsByClassAndGroup = {
        ALO: {
          group1: [
            { id: '1', messagesSent: { invitation: true } },
            { id: '2' }, // Missing messagesSent
          ],
        },
      } as unknown as Record<string, Record<string, JsonRegistration[]>>

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual([])
    })

    it('should handle empty input', () => {
      const result = findClassesToMark({}, 'invitation')
      expect(result).toEqual([])
    })
  })

  describe('sendTemplatedEmailToEventRegistrations', () => {
    beforeEach(() => {
      jest.clearAllMocks()

      // Setup default mock implementations
      mockEmailTo.mockImplementation((reg: any) => {
        const emails = [reg.handler.email]
        if (reg.owner.email !== reg.handler.email) {
          emails.push(reg.owner.email)
        }
        return emails
      })

      mockSendTemplatedMail.mockResolvedValue({} as any)
      mockDynamoDB.update.mockResolvedValue({} as any)
    })

    it('should send emails to all registrations successfully', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2023-01-01 12:00Z'))
      const result = await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [
          { ...jsonRegistrationsToEventWithALOInvited[0] },
          { ...jsonRegistrationsToEventWithALOInvited[1], language: 'en' },
        ],
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      // Check result
      expect(result).toEqual({
        failed: [],
        ok: ['handler1@example.com', 'owner1@example.com', 'handler2@example.com', 'owner2@example.com'],
      })

      // Check email sending
      expect(mockSESSend).toHaveBeenCalledTimes(2)
      expect(mockSESSend).toHaveBeenCalledWith([['handler1@example.com', 'owner1@example.com'], 'invitation-local-fi'])
      expect(mockSESSend).toHaveBeenCalledWith([['handler2@example.com', 'owner2@example.com'], 'invitation-local-en'])

      // Check audit entries
      expect(mockAudit).toHaveBeenCalledTimes(2)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'testALOInvited:testALOInvited1',
        message: 'Email: Koekutsu, to: handler1@example.com, owner1@example.com',
        user: 'admin-user',
      })

      // Check lastEmail updates
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            lastEmail: 'Koekutsu 1.1.2023 14:00',
          },
        }
      )

      // Check messagesSent updates
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: { invitation: true },
          },
        }
      )

      jest.useRealTimers()
    })

    it('should handle failed email sending', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      // Make the second email fail
      mockSESSend.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Email sending failed'))

      const result = await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        jsonRegistrationsToEventWithALOInvited.slice(0, 2).map((r) => ({ ...r })),
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      expect(mockSESSend).toHaveBeenCalledTimes(2)

      // Check result
      expect(result).toEqual({
        failed: ['handler2@example.com', 'owner2@example.com'],
        ok: ['handler1@example.com', 'owner1@example.com'],
      })

      // Check audit entries for failure
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'testALOInvited:testALOInvited2',
        message: 'FAILED Koekutsu: handler2@example.com, owner2@example.com',
        user: 'admin-user',
      })

      // Check that messagesSent was not updated for the failed email
      const messagesSentUpdates = mockDynamoDB.update.mock.calls.filter(
        (call) => call[0].id === 'reg-2' && call[1].set && call[1].set.messagesSent
      )
      expect(messagesSentUpdates.length).toBe(0)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should update existing messagesSent property', async () => {
      // Registration with existing messagesSent property
      const registrationWithExistingMessages = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        messagesSent: { registration: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [registrationWithExistingMessages],
        'https://example.com',
        'Test message',
        'admin-user',
        { context: 'data' } as any
      )

      // Check that messagesSent was properly updated
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: { invitation: true, registration: true },
          },
        }
      )

      // Check that the in-memory object was updated
      expect(registrationWithExistingMessages.messagesSent).toEqual({
        invitation: true,
        registration: true,
      })
    })

    it('should handle reserve template with group number', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2023-01-01 12:00Z'))

      await sendTemplatedEmailToEventRegistrations(
        'reserve',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [jsonRegistrationsToEventWithALOInvited[0]],
        'https://example.com',
        'Test message',
        'admin-user',
        { context: 'data' } as any
      )

      // Check lastEmail format for reserve template
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            lastEmail: 'Varasijailmoitus (#1) 1.1.2023 14:00',
          },
        }
      )

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: {
              reserve: true,
            },
          },
        }
      )

      jest.useRealTimers()
    })
  })
})
