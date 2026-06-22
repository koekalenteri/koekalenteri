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
  hasRegistrationChanges,
  getRegistrationsByEventId,
  getReadyRegistrationsByEventId,
  groupRegistrationsByClass,
  groupRegistrationsByClassAndGroup,
  sendTemplatedEmailToEventRegistrations,
  patchRegistration,
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

  describe('getRegistrationsByEventId', () => {
    it('should return empty array when query returns undefined', async () => {
      mockDynamoDB.query.mockResolvedValueOnce(undefined)

      const result = await getRegistrationsByEventId('event-id')

      expect(result).toEqual([])
      expect(mockDynamoDB.query).toHaveBeenCalledWith({
        key: 'eventId = :eventId',
        values: { ':eventId': 'event-id' },
      })
    })

    it('should return empty array when query returns empty array', async () => {
      mockDynamoDB.query.mockResolvedValueOnce([])

      const result = await getRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })

    it('should return all registrations regardless of state', async () => {
      const registrations = [
        { eventId: 'event-id', id: 'reg1', state: 'ready' },
        { eventId: 'event-id', id: 'reg2', state: 'cancelled' },
        { eventId: 'event-id', id: 'reg3', state: 'pending' },
      ]
      mockDynamoDB.query.mockResolvedValueOnce(registrations)

      const result = await getRegistrationsByEventId('event-id')

      expect(result).toEqual(registrations)
      expect(result).toHaveLength(3)
    })
  })

  describe('getReadyRegistrationsByEventId', () => {
    it('should return empty array when no registrations exist', async () => {
      mockDynamoDB.query.mockResolvedValueOnce([])

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })

    it('should return only ready registrations', async () => {
      const registrations = [
        { eventId: 'event-id', id: 'reg1', state: 'ready' },
        { eventId: 'event-id', id: 'reg2', state: 'cancelled' },
        { eventId: 'event-id', id: 'reg3', state: 'ready' },
        { eventId: 'event-id', id: 'reg4', state: 'pending' },
      ]
      mockDynamoDB.query.mockResolvedValueOnce(registrations)

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toHaveLength(2)
      expect(result.every((r) => r.state === 'ready')).toBe(true)
      expect(result.map((r) => r.id)).toEqual(['reg1', 'reg3'])
    })

    it('should return empty array when all registrations are non-ready', async () => {
      const registrations = [
        { eventId: 'event-id', id: 'reg1', state: 'cancelled' },
        { eventId: 'event-id', id: 'reg2', state: 'pending' },
      ]
      mockDynamoDB.query.mockResolvedValueOnce(registrations)

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toEqual([])
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

  describe('hasRegistrationChanges', () => {
    it('returns false when only modified fields change', () => {
      const existing = JSON.parse(
        JSON.stringify({
          ...registrationsToEventWithParticipantsInvited[0],
          modifiedAt: '2024-01-01T10:00:00.000Z',
          modifiedBy: 'first-user',
        })
      ) as JsonRegistration
      const updated = {
        ...existing,
        modifiedAt: '2024-01-01T11:00:00.000Z',
        modifiedBy: 'second-user',
      } as JsonRegistration

      expect(hasRegistrationChanges(existing, updated)).toBe(false)
    })

    it('returns true when a meaningful registration field changes', () => {
      const existing = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[0])) as JsonRegistration
      const updated = {
        ...existing,
        confirmed: true,
      } as JsonRegistration

      expect(hasRegistrationChanges(existing, updated)).toBe(true)
    })
  })

  describe('patchRegistration', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('updates only changed fields and reloads the registration', async () => {
      const existing = {
        dog: { name: 'Old name', regNo: 'REG-1' },
        emailDeliveryStatus: { status: 'bounce' },
        eventId: 'event-id',
        id: 'reg-id',
        notes: 'old',
      } as unknown as JsonRegistration
      const next = {
        ...existing,
        dog: { name: 'New name', regNo: 'REG-1' },
        emailDeliveryStatus: undefined,
        notes: 'new',
      } as unknown as JsonRegistration
      mockDynamoDB.read.mockResolvedValueOnce(next)

      const result = await patchRegistration(existing.eventId, existing.id, existing, next)

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'event-id', id: 'reg-id' },
        {
          remove: ['emailDeliveryStatus'],
          set: {
            'dog.name': 'New name',
            notes: 'new',
          },
        },
        'registration-table-not-found-in-env'
      )
      expect(mockDynamoDB.read).toHaveBeenCalledWith(
        {
          eventId: 'event-id',
          id: 'reg-id',
        },
        'registration-table-not-found-in-env'
      )
      expect(result).toEqual(next)
    })

    it('does nothing for no-op patches', async () => {
      const existing = { eventId: 'event-id', id: 'reg-id', notes: 'old' } as unknown as JsonRegistration

      const result = await patchRegistration(existing.eventId, existing.id, existing, { ...existing })

      expect(mockDynamoDB.update).not.toHaveBeenCalled()
      expect(mockDynamoDB.read).not.toHaveBeenCalled()
      expect(result).toBe(existing)
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
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'alo-attachment' } },
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
            updatedAt: expect.any(String),
          },
        }
      )

      // Check messagesSent updates
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: { invitation: true },
            updatedAt: expect.any(String),
          },
        }
      )
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            invitationAttachmentSent: 'alo-attachment',
            updatedAt: expect.any(String),
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
            updatedAt: expect.any(String),
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
            updatedAt: expect.any(String),
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
            updatedAt: expect.any(String),
          },
        }
      )

      jest.useRealTimers()
    })
  })
})
