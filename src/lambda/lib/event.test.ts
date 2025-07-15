import type { JsonConfirmedEvent, JsonDogEvent, JsonRegistration, JsonUser } from '../../types'

import { jest } from '@jest/globals'

import { PRIORITY_MEMBER } from '../../lib/priority'

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

const mockBroadcast = jest.fn()
jest.unstable_mockModule('./broadcast', () => ({
  __esModule: true,
  broadcastEvent: mockBroadcast,
}))

// Mock registration module functions
const mockSortRegistrationsByDateClassTimeAndNumber = jest.fn((_a, _b) => 0) // Default sort implementation
const mockGetRegistrationNumberingGroupKey = jest.fn()
const mockGetRegistrationGroupKey = jest.fn()
const mockHasPriority = jest.fn()
const mockGroupKeyCancelled = 'cancelled'
const mockGroupKeyReserve = 'reserve'

jest.unstable_mockModule('../../lib/registration', () => ({
  __esModule: true,
  sortRegistrationsByDateClassTimeAndNumber: mockSortRegistrationsByDateClassTimeAndNumber,
  getRegistrationNumberingGroupKey: mockGetRegistrationNumberingGroupKey,
  getRegistrationGroupKey: mockGetRegistrationGroupKey,
  GROUP_KEY_CANCELLED: mockGroupKeyCancelled,
  GROUP_KEY_RESERVE: mockGroupKeyReserve,
  hasPriority: mockHasPriority,
}))

const {
  findQualificationStartDate,
  fixRegistrationGroups,
  formatGroupAuditInfo,
  getEvent,
  getStateFromTemplate,
  markParticipants,
  saveEvent,
  saveGroup,
  updateRegistrations,
  upgradeClassState,
  upgradeEventState,
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

      expect(mockQuery).toHaveBeenCalledWith({
        key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
        values: { ':entryEndDate': '2025-03-22T17:00:00.000Z', ':eventType': 'NOME-B SM' },
        table: 'event-table-not-found-in-env',
        index: 'gsiEventTypeEntryEndDate',
        forward: false,
        limit: 1,
      })
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
        {
          set: {
            classes: event.classes,
            state: event.state,
          },
        },
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

    it('does not update event state if not all classes have the same state', async () => {
      const event = {
        id: 'e3',
        state: 'confirmed',
        classes: [
          { class: 'ALO', state: 'pending' },
          { class: 'AVO', state: 'pending' },
          { class: 'VOI', state: 'pending' },
        ],
      } as unknown as JsonConfirmedEvent

      await markParticipants(event, 'invited', 'ALO')

      // Only ALO class should be updated
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('invited')
      expect(event.classes.find((c) => c.class === 'AVO')?.state).toBe('pending')
      expect(event.classes.find((c) => c.class === 'VOI')?.state).toBe('pending')

      // Event state should remain unchanged
      expect(event.state).toBe('confirmed')
    })

    it('handles state progression correctly', async () => {
      const event = {
        id: 'e4',
        state: 'confirmed',
        classes: [
          { class: 'ALO', state: 'picked' },
          { class: 'AVO', state: 'picked' },
        ],
      } as unknown as JsonConfirmedEvent

      // Update ALO class to 'invited'
      await markParticipants(event, 'invited', 'ALO')

      // ALO should be updated, AVO should remain the same
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('invited')
      expect(event.classes.find((c) => c.class === 'AVO')?.state).toBe('picked')

      // Update AVO class to 'invited'
      await markParticipants(event, 'invited', 'AVO')

      // Both classes should now be 'invited'
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('invited')
      expect(event.classes.find((c) => c.class === 'AVO')?.state).toBe('invited')

      // Event state should be updated to 'invited'
      expect(event.state).toBe('invited')

      // Verify update was called twice
      expect(mockUpdate).toHaveBeenCalledTimes(2)
    })

    it('does not downgrade state when lower state is provided', async () => {
      const event = {
        id: 'e5',
        state: 'started',
        classes: [
          { class: 'ALO', state: 'started' },
          { class: 'AVO', state: 'invited' },
        ],
      } as unknown as JsonConfirmedEvent

      // Try to downgrade ALO from 'started' to 'invited'
      await markParticipants(event, 'invited', 'ALO')

      // ALO should remain 'started'
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('started')

      // Event state should remain 'started'
      expect(event.state).toBe('started')
    })

    it('handles case with no eventClass parameter', async () => {
      const event = {
        id: 'e6',
        state: 'confirmed',
      } as unknown as JsonConfirmedEvent

      await markParticipants(event, 'invited')

      // Event state should be updated to 'invited'
      expect(event.state).toBe('invited')
    })
  })

  // updateRegistrations
  describe('updateRegistrations', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
      mockQuery.mockReset()
      mockRead.mockReset()
      mockBroadcast.mockReset()
      mockHasPriority.mockReset()
    })

    it('updates event entries and members', async () => {
      const event = { id: 'e3', classes: [{ class: 'A' }], state: 'ready' }
      mockRead.mockResolvedValueOnce(event)
      const regs = [
        { class: 'ALO', state: 'ready', cancelled: false, paidAmount: 1 },
        { class: 'AVO', state: 'ready', cancelled: false, paidAmount: 0 },
      ]
      mockQuery.mockResolvedValueOnce(regs)

      // Mock hasPriority to return false for all registrations
      mockHasPriority.mockReturnValue(false)

      const result = await updateRegistrations('e3')
      expect(result.entries).toBe(2)
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('avoids noop updates when no changes are detected', async () => {
      // Set up an event with existing entries and members
      const event = {
        id: 'e4',
        entries: 2,
        members: 1,
        classes: [
          { class: 'ALO', entries: 1, members: 0 },
          { class: 'AVO', entries: 1, members: 1 },
        ],
        priority: [PRIORITY_MEMBER],
        state: 'confirmed',
      }
      mockRead.mockResolvedValueOnce(event)

      // Set up registrations that would result in the same counts
      const regs = [
        { class: 'ALO', state: 'ready', cancelled: false, paidAmount: 1 },
        { class: 'AVO', state: 'ready', cancelled: false, paidAmount: 0, handler: { membership: true } },
      ]
      mockQuery.mockResolvedValueOnce(regs)

      // Mock hasPriority to return true only for the AVO registration with membership
      mockHasPriority.mockImplementation((event: any, reg: any) => {
        return reg.class === 'AVO' && reg.handler?.membership === true
      })

      await updateRegistrations('e4')

      // Verify that no update was performed
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockBroadcast).not.toHaveBeenCalled()
    })

    it('uses provided updatedRegistrations parameter when available', async () => {
      const event = {
        id: 'e5',
        classes: [
          { class: 'ALO', entries: 0, members: 0 },
          { class: 'AVO', entries: 0, members: 0 },
        ],
        state: 'ready',
      }
      mockRead.mockResolvedValueOnce(event)

      // These registrations should be used directly without querying the database
      const updatedRegs = [
        { eventId: 'e5', id: 'r1', class: 'ALO', state: 'ready', cancelled: false, paidAmount: 1 },
        { eventId: 'e5', id: 'r2', class: 'ALO', state: 'ready', cancelled: false, paidAmount: 1 },
        {
          eventId: 'e5',
          id: 'r3',
          class: 'AVO',
          state: 'ready',
          cancelled: false,
          paidAmount: 1,
          handler: { membership: true },
        },
      ] as unknown as JsonRegistration[]

      // Mock hasPriority to return true only for the AVO registration with membership
      mockHasPriority.mockImplementation((event: any, reg: any) => {
        return reg.class === 'AVO' && reg.handler?.membership === true
      })

      const result = await updateRegistrations('e5', updatedRegs)

      // Verify database was not queried for registrations
      expect(mockQuery).not.toHaveBeenCalled()

      // Verify correct counts
      expect(result.entries).toBe(3)
      expect(result.members).toBe(1)

      // Verify class counts
      const aloClass = result.classes.find((c: any) => c.class === 'ALO')
      const avoClass = result.classes.find((c: any) => c.class === 'AVO')
      expect(aloClass?.entries).toBe(2)
      expect(aloClass?.members).toBe(0)
      expect(avoClass?.entries).toBe(1)
      expect(avoClass?.members).toBe(1)

      // Verify update was called with correct parameters
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e5' },
        {
          set: {
            entries: 3,
            members: 1,
            classes: result.classes,
          },
        },
        expect.anything()
      )

      // Verify broadcast was called
      expect(mockBroadcast).toHaveBeenCalled()
    })

    it('handles empty updatedRegistrations array', async () => {
      const event = {
        id: 'e6',
        entries: 5,
        members: 2,
        classes: [
          { class: 'ALO', entries: 3, members: 1 },
          { class: 'AVO', entries: 2, members: 1 },
        ],
        state: 'ready',
      }
      mockRead.mockResolvedValueOnce(event)

      // Empty registrations array
      const updatedRegs: JsonRegistration[] = []

      const result = await updateRegistrations('e6', updatedRegs)

      // Verify database was not queried for registrations
      expect(mockQuery).not.toHaveBeenCalled()

      // Verify counts were updated to zero
      expect(result.entries).toBe(0)
      expect(result.members).toBe(0)

      // Verify class counts were updated to zero
      const aloClass = result.classes.find((c: any) => c.class === 'ALO')
      const avoClass = result.classes.find((c: any) => c.class === 'AVO')
      expect(aloClass?.entries).toBe(0)
      expect(aloClass?.members).toBe(0)
      expect(avoClass?.entries).toBe(0)
      expect(avoClass?.members).toBe(0)

      // Verify update was called with correct parameters
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e6' },
        {
          set: {
            entries: 0,
            members: 0,
            classes: result.classes,
          },
        },
        expect.anything()
      )
    })

    it('throws LambdaError when event is not found', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(updateRegistrations('nonexistent-id')).rejects.toThrow(LambdaError)
      await expect(updateRegistrations('nonexistent-id')).rejects.toThrow(/not found/i)
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

      // Verify update was called with correct parameters
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e4', id: 'r1' },
        {
          set: {
            group: { key: 'cancelled', number: 1 },
            cancelled: true,
            cancelReason: 'cancelled by user',
          },
        },
        expect.anything()
      )

      // Verify audit was called
      expect(mockAudit).toHaveBeenCalled()
    })

    it('calls update without cancelReason for non-cancelled group', async () => {
      const group = {
        eventId: 'e5',
        id: 'r2',
        group: { key: '2024-08-02-ip', date: '2024-08-02T21:00:00.000Z', time: 'ip' as const, number: 3 },
      }
      const previousGroup = { key: 'reserve', number: 1 }
      const user = { name: 'admin' } as JsonUser

      await saveGroup(group, previousGroup, user, 'manual assignment')

      // Verify update was called with correct parameters (no cancelReason)
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e5', id: 'r2' },
        {
          set: {
            group: { key: '2024-08-02-ip', date: '2024-08-02T21:00:00.000Z', time: 'ip', number: 3 },
            cancelled: false,
          },
        },
        expect.anything()
      )

      // Verify audit was called with proper message
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'audit-key',
        user: 'admin',
        message: expect.stringContaining('Ryhmä: Ilmoittautuneet #1 -> la 3.8. ip #3 manual assignment'),
      })
    })

    it('handles case with no previous group', async () => {
      const group = { eventId: 'e6', id: 'r3', group: { key: 'reserve', number: 2 } }
      const user = { name: 'secretary' } as JsonUser

      await saveGroup(group, undefined, user, 'new registration')

      // Verify update was called
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e6', id: 'r3' },
        {
          set: {
            group: { key: 'reserve', number: 2 },
            cancelled: false,
          },
        },
        expect.anything()
      )

      // Verify audit was called without the previous group info
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'audit-key',
        user: 'secretary',
        message: expect.stringContaining('Ryhmä: Ilmoittautuneet #2 new registration'),
      })
    })

    it('handles cancelled group without cancelReason', async () => {
      const group = { eventId: 'e7', id: 'r4', group: { key: 'cancelled', number: 5 } }
      const previousGroup = { key: '2024-08-02-ip', date: '2024-08-02T21:00:00.000Z', time: 'ip' as const, number: 10 }
      const user = { name: 'organizer' } as JsonUser

      await saveGroup(group, previousGroup, user)

      // Verify update was called without cancelReason
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e7', id: 'r4' },
        {
          set: {
            group: { key: 'cancelled', number: 5 },
            cancelled: true,
          },
        },
        expect.anything()
      )

      // Verify audit was called
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'audit-key',
        user: 'organizer',
        message: expect.stringContaining('Ryhmä: la 3.8. ip #10 -> Peruneet #5'),
      })
    })
  })

  // fixRegistrationGroups
  describe('fixRegistrationGroups', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
      mockAudit.mockReset()
      mockGetRegistrationNumberingGroupKey.mockReset()
      mockGetRegistrationGroupKey.mockReset()
      mockSortRegistrationsByDateClassTimeAndNumber.mockReset()
    })

    it('fixes group numbers and calls saveGroup if save=true', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        { class: 'ALO', group: { key: 'A', number: 3 } },
        { class: 'ALO', group: { key: 'A', number: 1 } },
      ] as JsonRegistration[]

      // Mock the numbering group key to be the same for both registrations
      mockGetRegistrationNumberingGroupKey.mockReturnValueOnce('ALO').mockReturnValueOnce('ALO')

      // Mock the group key to be 'A' for both registrations
      mockGetRegistrationGroupKey.mockReturnValueOnce('A').mockReturnValueOnce('A')

      const result = await fixRegistrationGroups(regs, user, true)
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.number).toBe(2)
      expect(mockAudit).toHaveBeenCalled()
    })

    it('fixes group numbers but does not call saveGroup if save=false', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        { class: 'ALO', group: { key: 'A', number: 3 } },
        { class: 'ALO', group: { key: 'A', number: 1 } },
      ] as JsonRegistration[]
      const result = await fixRegistrationGroups(regs, user, false)
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.number).toBe(2)
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('handles multiple numbering groups correctly', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        // First numbering group - ALO class
        { class: 'ALO', group: { key: 'A', number: 2 } },
        { class: 'ALO', group: { key: 'A', number: 5 } },
        // Second numbering group - AVO class
        { class: 'AVO', group: { key: 'B', number: 10 } },
        { class: 'AVO', group: { key: 'B', number: 3 } },
      ] as JsonRegistration[]

      // Mock getRegistrationNumberingGroupKey to return different keys for different classes
      mockGetRegistrationNumberingGroupKey
        .mockReturnValueOnce('ALO') // First ALO registration
        .mockReturnValueOnce('ALO') // Second ALO registration
        .mockReturnValueOnce('AVO') // First AVO registration
        .mockReturnValueOnce('AVO') // Second AVO registration

      // Mock getRegistrationGroupKey to return appropriate keys
      mockGetRegistrationGroupKey
        .mockReturnValueOnce('A') // First ALO registration
        .mockReturnValueOnce('A') // Second ALO registration
        .mockReturnValueOnce('B') // First AVO registration
        .mockReturnValueOnce('B') // Second AVO registration

      const result = await fixRegistrationGroups(regs, user, false)

      // ALO class should be numbered 1, 2
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.number).toBe(2)

      // AVO class should be numbered 1, 2 (separate numbering)
      expect(result[2].group?.number).toBe(1)
      expect(result[3].group?.number).toBe(2)
    })

    it('updates group key if it has changed', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        {
          class: 'ALO',
          eventId: 'event1',
          id: 'reg1',
          group: { key: 'old-key', number: 1 },
        },
      ] as JsonRegistration[]

      // Mock getRegistrationGroupKey to return a different key
      jest.spyOn(await import('../../lib/registration'), 'getRegistrationGroupKey').mockReturnValueOnce('new-key')

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group?.key).toBe('new-key')
      expect(mockAudit).toHaveBeenCalled()
    })

    it('preserves additional group properties', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        {
          class: 'ALO',
          group: {
            key: 'A',
            number: 3,
            date: '2024-08-02T21:00:00.000Z',
            time: 'ip',
          },
        },
      ] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, false)

      expect(result[0].group?.number).toBe(1)
      expect(result[0].group?.date).toBe('2024-08-02T21:00:00.000Z')
      expect(result[0].group?.time).toBe('ip')
    })

    it('handles empty array', async () => {
      const user = { name: 'user' } as JsonUser
      const regs: JsonRegistration[] = []

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result).toEqual([])
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('handles single registration', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [{ class: 'ALO', group: { key: 'A', number: 5 } }] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group?.number).toBe(1)
      expect(mockAudit).toHaveBeenCalled()
    })

    it('skips update if group key and number are already correct', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [{ class: 'ALO', group: { key: 'A', number: 1 } }] as JsonRegistration[]

      // Mock getRegistrationGroupKey to return the same key
      mockGetRegistrationGroupKey.mockReturnValueOnce('A')

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group?.number).toBe(1)
      expect(mockAudit).not.toHaveBeenCalled() // saveGroup should not be called
    })

    it('verifies registrations are sorted before processing', async () => {
      const user = { name: 'user' } as JsonUser
      mockSortRegistrationsByDateClassTimeAndNumber.mockClear()

      const regs = [
        { class: 'ALO', group: { key: 'A', number: 1 } },
        { class: 'AVO', group: { key: 'B', number: 2 } },
      ] as JsonRegistration[]

      await fixRegistrationGroups(regs, user, false)

      expect(mockSortRegistrationsByDateClassTimeAndNumber).toHaveBeenCalled()
    })

    it('creates group property if it does not exist', async () => {
      const user = { name: 'user' } as JsonUser
      const regs = [
        { class: 'ALO', eventId: 'event1', id: 'reg1' }, // No group property
      ] as JsonRegistration[]

      // Mock getRegistrationGroupKey to return a key
      mockGetRegistrationGroupKey.mockReturnValueOnce('new-key')

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group).toBeDefined()
      expect(result[0].group?.key).toBe('new-key')
      expect(result[0].group?.number).toBe(1)
      expect(mockAudit).toHaveBeenCalled()
    })

    it('handles registrations with different dates and times', async () => {
      const user = { name: 'user' } as JsonUser
      mockAudit.mockClear()

      // Mock getRegistrationNumberingGroupKey to return different keys based on date/time
      mockGetRegistrationNumberingGroupKey
        .mockReturnValueOnce('ALO-morning')
        .mockReturnValueOnce('ALO-morning')
        .mockReturnValueOnce('ALO-afternoon')

      // Mock getRegistrationGroupKey to return keys with date/time info
      mockGetRegistrationGroupKey
        .mockReturnValueOnce('2024-08-02-ap')
        .mockReturnValueOnce('2024-08-02-ap')
        .mockReturnValueOnce('2024-08-02-ip')

      const regs = [
        { class: 'ALO', date: '2024-08-02', time: 'ap', group: { key: 'old', number: 5 } },
        { class: 'ALO', date: '2024-08-02', time: 'ap', group: { key: 'old', number: 3 } },
        { class: 'ALO', date: '2024-08-02', time: 'ip', group: { key: 'old', number: 7 } },
      ] as unknown as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, false)

      // Morning group should be numbered 1, 2
      expect(result[0].group?.key).toBe('2024-08-02-ap')
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.key).toBe('2024-08-02-ap')
      expect(result[1].group?.number).toBe(2)

      // Afternoon group should be numbered 1
      expect(result[2].group?.key).toBe('2024-08-02-ip')
      expect(result[2].group?.number).toBe(1)
    })

    it('handles special group keys like cancelled and reserve', async () => {
      const user = { name: 'user' } as JsonUser
      mockAudit.mockClear()

      // Mock getRegistrationNumberingGroupKey to return different keys
      mockGetRegistrationNumberingGroupKey.mockReturnValueOnce('ALO-cancelled').mockReturnValueOnce('ALO-reserve')

      // Mock getRegistrationGroupKey to return special keys
      mockGetRegistrationGroupKey.mockReturnValueOnce(mockGroupKeyCancelled).mockReturnValueOnce(mockGroupKeyReserve)

      const regs = [
        { class: 'ALO', cancelled: true, group: { key: 'old', number: 3 } },
        { class: 'ALO', state: 'pending', group: { key: 'old', number: 2 } },
      ] as unknown as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)

      // Cancelled group
      expect(result[0].group?.key).toBe(mockGroupKeyCancelled)
      expect(result[0].group?.number).toBe(1)

      // Reserve group
      expect(result[1].group?.key).toBe(mockGroupKeyReserve)
      expect(result[1].group?.number).toBe(1)

      expect(mockAudit).toHaveBeenCalledTimes(2)
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

  // getStateFromTemplate
  describe('getStateFromTemplate', () => {
    it('should return "invited" for invitation template', () => {
      expect(getStateFromTemplate('invitation')).toBe('invited')
    })

    it('should return "picked" for picked template', () => {
      expect(getStateFromTemplate('picked')).toBe('picked')
    })

    it('should return "picked" for any other template', () => {
      expect(getStateFromTemplate('unknown')).toBe('picked')
      expect(getStateFromTemplate('reserve')).toBe('picked')
      expect(getStateFromTemplate('receipt')).toBe('picked')
    })
  })

  // upgradeClassState
  describe('upgradeClassState', () => {
    it('should return newState when oldState is undefined', () => {
      expect(upgradeClassState(undefined, 'invited')).toBe('invited')
    })

    it('should return newState when it has higher precedence than oldState', () => {
      expect(upgradeClassState('picked', 'invited')).toBe('invited')
      expect(upgradeClassState('invited', 'started')).toBe('started')
      expect(upgradeClassState('started', 'ended')).toBe('ended')
    })

    it('should return oldState when it has higher precedence than newState', () => {
      expect(upgradeClassState('invited', 'picked')).toBe('invited')
      expect(upgradeClassState('started', 'invited')).toBe('started')
      expect(upgradeClassState('ended', 'started')).toBe('ended')
    })

    it('should return oldState when both states have the same precedence', () => {
      expect(upgradeClassState('picked', 'picked')).toBe('picked')
      expect(upgradeClassState('invited', 'invited')).toBe('invited')
      expect(upgradeClassState('started', 'started')).toBe('started')
      expect(upgradeClassState('ended', 'ended')).toBe('ended')
    })
  })

  // upgradeEventState
  describe('upgradeEventState', () => {
    it('should return newState when oldState is undefined', () => {
      expect(upgradeEventState(undefined, 'confirmed')).toBe('confirmed')
    })

    it('should return newState when it has higher precedence than oldState', () => {
      expect(upgradeEventState('confirmed', 'picked')).toBe('picked')
      expect(upgradeEventState('picked', 'invited')).toBe('invited')
      expect(upgradeEventState('invited', 'started')).toBe('started')
      expect(upgradeEventState('started', 'ended')).toBe('ended')
    })

    it('should return oldState when it has higher precedence than newState', () => {
      expect(upgradeEventState('picked', 'confirmed')).toBe('picked')
      expect(upgradeEventState('invited', 'picked')).toBe('invited')
      expect(upgradeEventState('started', 'invited')).toBe('started')
      expect(upgradeEventState('ended', 'started')).toBe('ended')
    })

    it('should return oldState when both states have the same precedence', () => {
      expect(upgradeEventState('confirmed', 'confirmed')).toBe('confirmed')
      expect(upgradeEventState('picked', 'picked')).toBe('picked')
      expect(upgradeEventState('invited', 'invited')).toBe('invited')
      expect(upgradeEventState('started', 'started')).toBe('started')
      expect(upgradeEventState('ended', 'ended')).toBe('ended')
    })
  })
})
