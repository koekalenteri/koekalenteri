import type { JsonConfirmedEvent, JsonDogEvent, JsonRegistration, JsonUser } from '../../types'

import { jest } from '@jest/globals'

const mockQuery = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockWrite = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    query: mockQuery,
    read: mockRead,
    update: mockUpdate,
    write: mockWrite,
  })),
}))

const mockAudit = jest.fn()
jest.unstable_mockModule('./audit', () => ({
  __esModule: true,
  audit: mockAudit,
  registrationAuditKey: jest.fn(() => 'audit-key'),
}))

const {
  findQualificationStartDate,
  fixRegistrationGroups,
  formatGroupAuditInfo,
  getEvent,
  markParticipants,
  saveEvent,
  saveGroup,
  updateRegistrations,
} = await import('./event')

const { LambdaError } = await import('./lambda')

describe('lib/event', () => {
  describe('formatGroupAuditInfo', () => {
    it('should format properly', () => {
      expect(formatGroupAuditInfo({ key: 'cancelled', number: 5 })).toEqual('Peruneet #5')
      expect(formatGroupAuditInfo({ key: 'reserve', number: 1 })).toEqual('Ilmoittautuneet #1')
      expect(
        formatGroupAuditInfo({ key: '2024-08-02-ip', date: '2024-08-02T21:00:00.000Z', number: 20, time: 'ip' })
      ).toEqual('la 3.8. ip #20')
    })
  })

  describe('findQualificationStartDate', () => {
    it('should call query with proper arguments', async () => {
      await findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())

      expect(mockQuery).toHaveBeenCalledWith(
        'eventType = :eventType AND entryEndDate < :entryEndDate',
        { ':entryEndDate': '2025-03-22T17:00:00.000Z', ':eventType': 'NOME-B SM' },
        'event-table-not-found-in-env',
        'gsiEventTypeEntryEndDate',
        undefined,
        false,
        1
      )
    })
    it.each([undefined, [], [{}], [1, 2]])('should return undefined when query returns %p', (result) => {
      mockQuery.mockResolvedValueOnce(result)
      expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toBeUndefined()
    })

    it('should return start of next day from the entryEndDate', () => {
      mockQuery.mockResolvedValueOnce([{ entryEndDate: '2024-08-20T23:59:59.999+03:00' }])
      expect(findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())).resolves.toEqual(
        '2024-08-21T00:00:00.000+03:00'
      )
    })

    it('should prefer entryOrigEndDate when available ', () => {
      mockQuery.mockResolvedValueOnce([
        { entryEndDate: '2024-08-20T23:59:59.999+03:00', entryOrigEndDate: '2024-08-15T23:59:59.999+03:00' },
      ])
      expect(findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())).resolves.toEqual(
        '2024-08-16T00:00:00.000+03:00'
      )
    })
  })

  describe('getEvent', () => {
    const eventId = 'test-id'
    const eventObj = { id: eventId, name: 'Test Event' }

    beforeEach(() => {
      mockRead.mockReset()
    })

    it('returns the event when found', async () => {
      mockRead.mockResolvedValueOnce(eventObj)
      const result = await getEvent(eventId)
      expect(result).toEqual(eventObj)
      expect(mockRead).toHaveBeenCalledWith({ id: eventId }, expect.anything())
    })

    it('throws LambdaError(404) when not found', async () => {
      mockRead.mockResolvedValueOnce(undefined)
      await expect(getEvent(eventId)).rejects.toThrow(LambdaError)
      await expect(getEvent(eventId)).rejects.toThrow(/not found/i)
    })
  })

  // markParticipants
  describe('markParticipants', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
    })
    it('updates all classes and event state if all invited', async () => {
      const event = {
        id: 'e1',
        state: 'pending',
        classes: [
          { class: 'ALO', state: 'invited' },
          { class: 'AVO', state: 'pending' },
        ],
      } as unknown as JsonConfirmedEvent

      await markParticipants(event, 'invited', 'AVO')
      expect(event.state).toBe('invited')
      expect(event.classes.every((c) => c.state === 'invited')).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e1' },
        'set #classes = :classes, #state = :state',
        { '#classes': 'classes', '#state': 'state' },
        { ':classes': event.classes, ':state': event.state },
        expect.anything()
      )
    })
    it('updates only one class if eventClass is given', async () => {
      const event = {
        id: 'e2',
        state: 'pending',
        classes: [
          { class: 'ALO', state: 'pending' },
          { class: 'VOI', state: 'pending' },
        ],
      } as unknown as JsonConfirmedEvent
      await markParticipants(event, 'invited', 'ALO')
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('invited')
      expect(event.classes.find((c) => c.class === 'VOI')?.state).toBe('pending')
    })
  })

  // updateRegistrations
  describe('updateRegistrations', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
      mockQuery.mockReset()
      mockRead.mockReset()
    })
    it('updates event entries and members', async () => {
      const event = { id: 'e3', classes: [{ class: 'A' }], state: 'ready' }
      mockRead.mockResolvedValueOnce(event)
      const regs = [
        { class: 'ALO', state: 'ready', cancelled: false, paidAmount: 1 },
        { class: 'AVO', state: 'ready', cancelled: false, paidAmount: 0 },
      ]
      mockQuery.mockResolvedValueOnce(regs)
      const result = await updateRegistrations('e3')
      expect(result.entries).toBe(2)
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  // saveGroup
  describe('saveGroup', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
      mockAudit.mockReset()
    })
    it('calls update and audit for cancelled group with reason', async () => {
      const group = { eventId: 'e4', id: 'r1', group: { key: 'cancelled', number: 1 } }
      await saveGroup(group, { key: 'reserve', number: 1 }, { name: 'user' } as JsonUser, 'test', 'cancelled by user')
      expect(mockUpdate).toHaveBeenCalled()
      expect(mockAudit).toHaveBeenCalled()
    })
  })

  // fixRegistrationGroups
  describe('fixRegistrationGroups', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
      mockAudit.mockReset()
    })
    it('fixes group numbers and calls saveGroup if save=true', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        { class: 'ALO', group: { key: 'A', number: 3 } },
        { class: 'ALO', group: { key: 'A', number: 1 } },
      ] as JsonRegistration[]
      const result = await fixRegistrationGroups(regs, user, true)
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.number).toBe(2)
      expect(mockAudit).toHaveBeenCalled()
    })
  })

  // saveEvent
  describe('saveEvent', () => {
    beforeEach(() => {
      mockWrite.mockReset()
    })
    it('calls write with event data', async () => {
      const event = { id: 'e6', name: 'Event' } as JsonDogEvent
      await saveEvent(event)
      expect(mockWrite).toHaveBeenCalledWith(event, expect.anything())
    })
  })
})
