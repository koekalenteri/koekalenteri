import type { DeepPartial, JsonConfirmedEvent, JsonDogEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { PRIORITY_MEMBER } from '../../lib/priority'
import { describeInTimeZone } from '../../test-utils/timeZone'

// The registration table is still reached through lib/registration's own client (KOE-1409).
const mockQuery = vi.fn()
const mockUpdate = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockQuery,
      update: mockUpdate,
    }
  }),
}))

const mockReadEvent = vi.fn()
const mockFindEventIdsByKcGuid = vi.fn()
const mockFindEventIdsByKcId = vi.fn()
const mockReadLastEntryEndBefore = vi.fn()
const mockWriteEvent = vi.fn()
const mockWriteEventFields = vi.fn()
const mockWriteWorkflowLock = vi.fn()
const mockClearWorkflowLock = vi.fn()
const mockWriteResultsPublished = vi.fn()
const mockWriteKcStateReading = vi.fn()
const mockWriteKcStateLock = vi.fn()
const mockRestoreKcState = vi.fn()
const mockWriteKcGuidLink = vi.fn()

vi.doMock('./repositories/eventRepository', () => ({
  clearWorkflowLock: mockClearWorkflowLock,
  findEventIdsByKcGuid: mockFindEventIdsByKcGuid,
  findEventIdsByKcId: mockFindEventIdsByKcId,
  readEvent: mockReadEvent,
  readLastEntryEndBefore: mockReadLastEntryEndBefore,
  restoreKcState: mockRestoreKcState,
  writeEvent: mockWriteEvent,
  writeEventFields: mockWriteEventFields,
  writeKcGuidLink: mockWriteKcGuidLink,
  writeKcStateLock: mockWriteKcStateLock,
  writeKcStateReading: mockWriteKcStateReading,
  writeResultsPublished: mockWriteResultsPublished,
  writeWorkflowLock: mockWriteWorkflowLock,
}))

const mockAudit = vi.fn()
vi.doMock('./audit', () => ({
  __esModule: true,
  audit: mockAudit,
  eventAuditKey: vi.fn((event: { id: string }) => `event:${event.id}`),
  registrationAuditKey: vi.fn(() => 'audit-key'),
}))

const {
  findEventWithKcGuid,
  findEventWithKcId,
  findQualificationStartDate,
  fixRegistrationGroups,
  getEvent,
  getStateFromTemplate,
  lockKcState,
  lockRegistrationGroups,
  lockRegistrationPayments,
  markParticipants,
  patchEvent,
  releaseKcState,
  saveEvent,
  saveGroup,
  setResultsPublishedState,
  updateRegistrations,
  upgradeClassState,
  upgradeEventState,
  writeKcGuid,
  writeKcState,
} = await import('./event')

const { LambdaError } = await import('./lambda')

/**
 * These tests feed deliberately minimal events and registrations; the deep-partial fixtures
 * convert to the full json shapes at these named boundaries.
 */
const asJsonConfirmedEvent = (event: DeepPartial<JsonConfirmedEvent>) => event as JsonConfirmedEvent
const asJsonRegistrations = (regs: DeepPartial<JsonRegistration>[]) => regs as JsonRegistration[]

describe('the state read from Kennelliitto (KOE-1140)', () => {
  const state = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: '2026-09-26T10:00:00.000Z' }

  beforeEach(() => {
    mockWriteKcStateReading.mockReset()
    mockWriteKcStateLock.mockReset()
    mockRestoreKcState.mockReset()
    mockWriteKcGuidLink.mockReset()
  })

  describe('writeKcState', () => {
    it('writes the reading, with no fresh lock lifted by a reading of another state', async () => {
      await expect(writeKcState('event-1', state, state.readAt)).resolves.toBe(true)

      // A handed-over state younger than thirty seconds (longer than a request lives) stays against a reading of another state.
      expect(mockWriteKcStateReading).toHaveBeenCalledWith(
        'event-1',
        state,
        '2026-09-26T09:59:30.000Z',
        1253,
        state.readAt
      )
    })

    it('measures the window from the reading it writes, for a reading of another state', async () => {
      const open = { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T10:01:00.000Z' }

      await writeKcState('event-1', open, open.readAt)

      expect(mockWriteKcStateReading).toHaveBeenCalledWith(
        'event-1',
        open,
        '2026-09-26T10:00:30.000Z',
        1253,
        open.readAt
      )
    })

    it('answers false when a newer reading is stored, and lets any other failure through', async () => {
      mockWriteKcStateReading.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(writeKcState('event-1', state, state.readAt)).resolves.toBe(false)

      mockWriteKcStateReading.mockRejectedValueOnce(new Error('throttled'))
      await expect(writeKcState('event-1', state, state.readAt)).rejects.toThrow('throttled')
    })
  })

  describe('lockKcState', () => {
    it('takes the lock with the handed-over code it is given', async () => {
      await expect(lockKcState('event-1', state, 1253)).resolves.toBe(true)

      expect(mockWriteKcStateLock).toHaveBeenCalledWith('event-1', state, 1253)
    })

    it('answers false when another hand-over holds the lock, and lets any other failure through', async () => {
      mockWriteKcStateLock.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(lockKcState('event-1', state, 1253)).resolves.toBe(false)

      mockWriteKcStateLock.mockRejectedValueOnce(new Error('throttled'))
      await expect(lockKcState('event-1', state, 1253)).rejects.toThrow('throttled')
    })
  })

  describe('releaseKcState', () => {
    const restored = { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T10:00:05.000Z' }

    it('gives the state back held to the lock it wrote', async () => {
      await expect(releaseKcState('event-1', restored, state.readAt, restored.readAt)).resolves.toBe(true)

      expect(mockRestoreKcState).toHaveBeenCalledWith('event-1', restored, state.readAt, restored.readAt)
    })

    it('answers false when the stored state is not the lock, and lets any other failure through', async () => {
      mockRestoreKcState.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(releaseKcState('event-1', restored, state.readAt, restored.readAt)).resolves.toBe(false)

      mockRestoreKcState.mockRejectedValueOnce(new Error('throttled'))
      await expect(releaseKcState('event-1', restored, state.readAt, restored.readAt)).rejects.toThrow('throttled')
    })
  })

  describe('writeKcGuid', () => {
    it('links the event, and answers false when it has a link already', async () => {
      await expect(writeKcGuid('event-1', 'guid-1', '2026-09-26T10:00:00.000Z')).resolves.toBe(true)
      expect(mockWriteKcGuidLink).toHaveBeenCalledWith('event-1', 'guid-1', '2026-09-26T10:00:00.000Z')

      mockWriteKcGuidLink.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(writeKcGuid('event-1', 'guid-2', '2026-09-26T10:00:00.000Z')).resolves.toBe(false)
    })
  })
})

describe('lib/event', () => {
  describe('lockRegistrationGroups', () => {
    beforeEach(() => {
      mockWriteWorkflowLock.mockReset()
      mockClearWorkflowLock.mockReset()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('retries acquisition with backoff and ignores release after lease takeover', async () => {
      vi.useFakeTimers({ now: 1_000_000 })
      mockWriteWorkflowLock
        .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
        .mockResolvedValueOnce(undefined)

      const lockPromise = lockRegistrationGroups('event-1', 1)
      await vi.advanceTimersByTimeAsync(100)
      const release = await lockPromise

      expect(mockWriteWorkflowLock).toHaveBeenCalledTimes(2)
      // The lock lasts ninety seconds from the attempt that took it.
      expect(mockWriteWorkflowLock).toHaveBeenNthCalledWith(
        2,
        'event-1',
        'registrationGroupsLock',
        expect.any(String),
        1_000_100,
        1_090_100
      )

      mockClearWorkflowLock.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(release()).resolves.toBeUndefined()
      expect(mockClearWorkflowLock).toHaveBeenCalledWith('event-1', 'registrationGroupsLock', expect.any(String))
    })

    it('answers busy once the retries run out, and lets any other failure through', async () => {
      mockWriteWorkflowLock.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(lockRegistrationGroups('event-1')).rejects.toMatchObject({ status: 409 })

      mockWriteWorkflowLock.mockRejectedValueOnce(new Error('throttled'))
      await expect(lockRegistrationGroups('event-1')).rejects.toThrow('throttled')
    })

    it('lets a failed release through when it is not a lost lock', async () => {
      const release = await lockRegistrationGroups('event-1')

      mockClearWorkflowLock.mockRejectedValueOnce(new Error('throttled'))
      await expect(release()).rejects.toThrow('throttled')
    })
  })

  describe('lockRegistrationPayments', () => {
    beforeEach(() => {
      mockWriteWorkflowLock.mockReset()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('takes the payments lock, not the groups lock', async () => {
      await lockRegistrationPayments('event-1')

      expect(mockWriteWorkflowLock).toHaveBeenCalledWith(
        'event-1',
        'registrationPaymentsLock',
        expect.any(String),
        expect.any(Number),
        expect.any(Number)
      )
    })

    it('retries eight times by default, then answers with the payments conflict', async () => {
      vi.useFakeTimers()
      mockWriteWorkflowLock.mockRejectedValue({ name: 'ConditionalCheckFailedException' })

      const lock = lockRegistrationPayments('event-1')
      const refused = expect(lock).rejects.toMatchObject({
        error: 'Registration payments are being updated. Please retry.',
        status: 409,
      })
      await vi.runAllTimersAsync()
      await refused

      expect(mockWriteWorkflowLock).toHaveBeenCalledTimes(9)
    })
  })

  describe('findQualificationStartDate', () => {
    beforeEach(() => {
      mockReadLastEntryEndBefore.mockReset()
    })

    // The next Finnish day's start, over both changes of time, run in the lambda's zone (UTC).
    describeInTimeZone('UTC', () => {
      it.each([
        { entryEndDate: '2026-03-28T23:59:59.999+02:00', expected: '2026-03-28T22:00:00.000Z' },
        { entryEndDate: '2026-03-28T21:59:59.999Z', expected: '2026-03-28T22:00:00.000Z' },
        { entryEndDate: '2026-10-24T23:59:59.999+03:00', expected: '2026-10-24T21:00:00.000Z' },
        { entryEndDate: '2026-10-25T23:59:59.999+02:00', expected: '2026-10-25T22:00:00.000Z' },
        // Stored as the Finnish midnight that starts 25.10.: a 24-hour step in UTC landed on 25.10. 23:00,
        // still the 25th, where the next Finnish day is the 26th.
        { entryEndDate: '2026-10-24T21:00:00.000Z', expected: '2026-10-25T22:00:00.000Z' },
        { entryEndDate: '2026-03-28T22:00:00.000Z', expected: '2026-03-29T21:00:00.000Z' },
      ])('starts the qualification the Finnish day after $entryEndDate', async ({ entryEndDate, expected }) => {
        mockReadLastEntryEndBefore.mockResolvedValueOnce({ entryEndDate })

        await expect(findQualificationStartDate('NOME-B SM', '2027-01-01T00:00:00.000Z')).resolves.toEqual(expected)
      })
    })

    it('asks for the last entry end of the type before the one given', async () => {
      await findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())

      expect(mockReadLastEntryEndBefore).toHaveBeenCalledWith('NOME-B SM', '2025-03-22T17:00:00.000Z')
    })

    it.each([undefined, {}])('should return undefined when the previous event is %p', async (result) => {
      mockReadLastEntryEndBefore.mockResolvedValueOnce(result)
      await expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toBeUndefined()
    })

    it('should return start of next day from the entryEndDate', async () => {
      mockReadLastEntryEndBefore.mockResolvedValueOnce({ entryEndDate: '2024-08-20T23:59:59.999+03:00' })
      await expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toEqual('2024-08-20T21:00:00.000Z')
    })

    // The mocked read returns a field the index never projects (KOE-1554); the integration twin in
    // event.integration.test.ts is marked as failing until the projection is fixed, and the two must agree.
    it('should prefer entryOrigEndDate when available ', async () => {
      mockReadLastEntryEndBefore.mockResolvedValueOnce({
        entryEndDate: '2024-08-20T23:59:59.999+03:00',
        entryOrigEndDate: '2024-08-15T23:59:59.999+03:00',
      })
      await expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toEqual('2024-08-15T21:00:00.000Z')
    })
  })

  describe('findEventWithKcGuid (KOE-1534)', () => {
    const GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'

    beforeEach(() => {
      mockFindEventIdsByKcGuid.mockReset()
    })

    it('looks the GUID up', async () => {
      mockFindEventIdsByKcGuid.mockResolvedValueOnce([])

      await findEventWithKcGuid(GUID)

      expect(mockFindEventIdsByKcGuid).toHaveBeenCalledWith(GUID)
    })

    it('returns the other event that has the GUID', async () => {
      mockFindEventIdsByKcGuid.mockResolvedValueOnce([{ id: 'this' }, { id: 'other' }])

      await expect(findEventWithKcGuid(GUID, 'this')).resolves.toEqual({ id: 'other' })
    })

    it('finds no conflict when the only match is the event itself or nothing matches', async () => {
      mockFindEventIdsByKcGuid.mockResolvedValueOnce([{ id: 'this' }]).mockResolvedValueOnce(undefined)

      await expect(findEventWithKcGuid(GUID, 'this')).resolves.toBeUndefined()
      await expect(findEventWithKcGuid(GUID, 'this')).resolves.toBeUndefined()
    })
  })

  describe('findEventWithKcId', () => {
    beforeEach(() => {
      mockFindEventIdsByKcId.mockReset()
    })

    it('looks the trial number up and returns the other event that has it', async () => {
      mockFindEventIdsByKcId.mockResolvedValueOnce([{ id: 'this' }, { id: 'other' }])

      await expect(findEventWithKcId(123, 'this')).resolves.toEqual({ id: 'other' })
      expect(mockFindEventIdsByKcId).toHaveBeenCalledWith(123)
    })

    it('finds nothing when nothing matches', async () => {
      mockFindEventIdsByKcId.mockResolvedValueOnce(undefined)

      await expect(findEventWithKcId(123, 'this')).resolves.toBeUndefined()
    })
  })

  describe('getEvent', () => {
    const eventId = 'test-id'
    const eventObj = { id: eventId, name: 'Test Event' }

    beforeEach(() => {
      mockReadEvent.mockReset()
    })

    it('returns the event when found', async () => {
      mockReadEvent.mockResolvedValueOnce(eventObj)
      const result = await getEvent(eventId)
      expect(result).toEqual(eventObj)
      expect(mockReadEvent).toHaveBeenCalledWith(eventId, false)
    })

    it('reads the row as last written when asked to (KOE-1510)', async () => {
      mockReadEvent.mockResolvedValueOnce(eventObj)
      await getEvent(eventId, true)
      expect(mockReadEvent).toHaveBeenCalledWith(eventId, true)
    })

    it('throws LambdaError(404) when not found', async () => {
      mockReadEvent.mockResolvedValueOnce(undefined)
      await expect(getEvent(eventId)).rejects.toThrow(LambdaError)
      await expect(getEvent(eventId)).rejects.toThrow(/not found/i)
    })
  })

  // markParticipants
  describe('markParticipants', () => {
    beforeEach(() => {
      mockWriteEventFields.mockReset()
    })

    it('updates all classes and event state if all invited', async () => {
      const event = asJsonConfirmedEvent({
        classes: [
          { class: 'ALO', state: 'invited' },
          { class: 'AVO', state: 'picked' },
        ],
        id: 'e1',
        state: 'confirmed',
      })

      await markParticipants(event, 'invited', 'AVO')
      expect(event.state).toBe('invited')
      expect(event.classes.every((c) => c.state === 'invited')).toBe(true)
      expect(mockWriteEventFields).toHaveBeenCalledWith('e1', {
        set: {
          classes: event.classes,
          startListPublished: false,
          state: event.state,
          updatedAt: expect.any(String),
        },
      })
    })

    it('updates only one class if eventClass is given', async () => {
      const event = asJsonConfirmedEvent({
        classes: [
          { class: 'ALO', state: 'picked' },
          { class: 'VOI', state: 'picked' },
        ],
        id: 'e2',
        state: 'confirmed',
      })
      await markParticipants(event, 'invited', 'ALO')
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('invited')
      expect(event.classes.find((c) => c.class === 'VOI')?.state).toBe('picked')
    })

    it('keeps new class start lists unpublished when invitations advance their state', async () => {
      const event = {
        classes: [
          { class: 'ALO', state: 'picked' },
          { class: 'AVO', state: 'picked' },
        ],
        id: 'new-event',
        state: 'confirmed',
      } as JsonConfirmedEvent

      await markParticipants(event, 'invited', 'ALO')

      expect(event.startListPublished).toBe(false)
      expect(mockWriteEventFields).toHaveBeenCalledWith('new-event', {
        set: {
          classes: event.classes,
          startListPublished: false,
          state: event.state,
          updatedAt: expect.any(String),
        },
      })
    })

    it('sets a missing publication value to false even when another class is already invited', async () => {
      const event = {
        classes: [
          { class: 'ALO', state: 'invited' },
          { class: 'AVO', state: 'picked' },
        ],
        id: 'legacy-event',
        state: 'confirmed',
      } as JsonConfirmedEvent

      await markParticipants(event, 'invited', 'AVO')

      expect(event.startListPublished).toBe(false)
    })

    it('keeps a new classless event start list unpublished when invitations are sent', async () => {
      const event = asJsonConfirmedEvent({
        classes: [],
        id: 'classless-event',
        state: 'confirmed',
      })

      await markParticipants(event, 'invited')

      expect(event.state).toBe('invited')
      expect(event.startListPublished).toBe(false)
    })

    it('does not overwrite an explicit start list publication state', async () => {
      const event = {
        classes: [{ class: 'ALO', state: 'picked' }],
        id: 'published-event',
        startListPublished: { ALO: true },
        state: 'confirmed',
      } as JsonConfirmedEvent

      await markParticipants(event, 'invited', 'ALO')

      expect(event.startListPublished).toEqual({ ALO: true })
    })

    it('does not update event state if not all classes have the same state', async () => {
      const event = asJsonConfirmedEvent({
        classes: [
          { class: 'ALO', state: 'picked' },
          { class: 'AVO', state: 'picked' },
          { class: 'VOI', state: 'picked' },
        ],
        id: 'e3',
        state: 'confirmed',
      })

      await markParticipants(event, 'invited', 'ALO')

      // Only ALO class should be updated
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('invited')
      expect(event.classes.find((c) => c.class === 'AVO')?.state).toBe('picked')
      expect(event.classes.find((c) => c.class === 'VOI')?.state).toBe('picked')

      // Event state should remain unchanged
      expect(event.state).toBe('confirmed')
    })

    it('handles state progression correctly', async () => {
      const event = asJsonConfirmedEvent({
        classes: [
          { class: 'ALO', state: 'picked' },
          { class: 'AVO', state: 'picked' },
        ],
        id: 'e4',
        state: 'confirmed',
      })

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
      expect(mockWriteEventFields).toHaveBeenCalledTimes(2)
    })

    it('does not downgrade state when lower state is provided', async () => {
      const event = asJsonConfirmedEvent({
        classes: [
          { class: 'ALO', state: 'started' },
          { class: 'AVO', state: 'invited' },
        ],
        id: 'e5',
        state: 'started',
      })

      // Try to downgrade ALO from 'started' to 'invited'
      await markParticipants(event, 'invited', 'ALO')

      // ALO should remain 'started'
      expect(event.classes.find((c) => c.class === 'ALO')?.state).toBe('started')

      // Event state should remain 'started'
      expect(event.state).toBe('started')
    })

    it('handles case with no eventClass parameter', async () => {
      const event = asJsonConfirmedEvent({
        id: 'e6',
        state: 'confirmed',
      })

      await markParticipants(event, 'invited')

      // Event state should be updated to 'invited'
      expect(event.state).toBe('invited')
    })
  })

  // updateRegistrations
  describe('updateRegistrations', () => {
    beforeEach(() => {
      mockWriteEventFields.mockReset()
      mockQuery.mockReset()
      mockReadEvent.mockReset()
    })

    it('updates event entries and members', async () => {
      const event = {
        classes: [{ class: 'ALO' }, { class: 'AVO' }],
        id: 'e3',
        organizer: { id: 'org-1' },
        state: 'ready',
      }
      mockReadEvent.mockResolvedValueOnce(event)
      const regs = [
        { cancelled: false, class: 'ALO', eventId: 'e3', id: 'r1', paidAmount: 1, state: 'ready' },
        { cancelled: false, class: 'AVO', eventId: 'e3', id: 'r2', paidAmount: 0, state: 'ready' },
      ] as JsonRegistration[]
      mockQuery.mockResolvedValueOnce(regs)

      const result = await updateRegistrations('e3')
      expect(result.entries).toBe(2)
      expect(result.modifiedAt).toBeUndefined()
      expect(result.updatedAt).toEqual(expect.any(String))
      expect(mockWriteEventFields).toHaveBeenCalledWith('e3', {
        set: {
          classes: result.classes,
          entries: 2,
          members: 0,
          updatedAt: result.updatedAt,
        },
      })
      // The counts the caller broadcasts come off what this returns (KOE-1277, KOE-1340).
      expect(result).toMatchObject({ entries: 2, id: 'e3', members: 0 })
    })

    it('avoids noop updates when no changes are detected', async () => {
      // Set up an event with existing entries and members
      const event = {
        classes: [
          { class: 'ALO', entries: 1, members: 0 },
          { class: 'AVO', entries: 1, members: 1 },
        ],
        entries: 2,
        id: 'e4',
        members: 1,
        priority: [PRIORITY_MEMBER],
        state: 'confirmed',
      }
      mockReadEvent.mockResolvedValueOnce(event)

      // Set up registrations that would result in the same counts
      const regs = [
        { cancelled: false, class: 'ALO', paidAmount: 1, state: 'ready' },
        { cancelled: false, class: 'AVO', handler: { membership: true }, paidAmount: 0, state: 'ready' },
      ]
      mockQuery.mockResolvedValueOnce(regs)

      await updateRegistrations('e4')

      // Verify that no update was performed
      expect(mockWriteEventFields).not.toHaveBeenCalled()
    })

    it('uses provided updatedRegistrations parameter when available', async () => {
      const event = {
        classes: [
          { class: 'ALO', entries: 0, members: 0 },
          { class: 'AVO', entries: 0, members: 0 },
        ],
        id: 'e5',
        organizer: { id: 'org-1' },
        priority: [PRIORITY_MEMBER],
        state: 'ready',
      }
      mockReadEvent.mockResolvedValueOnce(event)

      // These registrations should be used directly without querying the database
      const updatedRegs = asJsonRegistrations([
        { cancelled: false, class: 'ALO', eventId: 'e5', id: 'r1', paidAmount: 1, state: 'ready' },
        { cancelled: false, class: 'ALO', eventId: 'e5', id: 'r2', paidAmount: 1, state: 'ready' },
        {
          cancelled: false,
          class: 'AVO',
          eventId: 'e5',
          handler: { membership: true },
          id: 'r3',
          paidAmount: 1,
          state: 'ready',
        },
      ])

      const result = await updateRegistrations('e5', updatedRegs)

      // Verify database was not queried for registrations
      expect(mockQuery).not.toHaveBeenCalled()

      // Verify correct counts
      expect(result.entries).toBe(3)
      expect(result.members).toBe(1)

      // Verify class counts
      const aloClass = result.classes.find((c) => c.class === 'ALO')
      const avoClass = result.classes.find((c) => c.class === 'AVO')
      expect(aloClass?.entries).toBe(2)
      expect(aloClass?.members).toBe(0)
      expect(avoClass?.entries).toBe(1)
      expect(avoClass?.members).toBe(1)

      // Verify update was called with correct parameters
      expect(mockWriteEventFields).toHaveBeenCalledWith('e5', {
        set: {
          classes: result.classes,
          entries: 3,
          members: 1,
          updatedAt: result.updatedAt,
        },
      })

      expect(result.modifiedAt).toBeUndefined()
      expect(result.updatedAt).toEqual(expect.any(String))
      expect(result).toMatchObject({ entries: 3, id: 'e5', members: 1 })
    })

    it('handles empty updatedRegistrations array', async () => {
      const event = {
        classes: [
          { class: 'ALO', entries: 3, members: 1 },
          { class: 'AVO', entries: 2, members: 1 },
        ],
        entries: 5,
        id: 'e6',
        members: 2,
        organizer: { id: 'org-1' },
        state: 'ready',
      }
      mockReadEvent.mockResolvedValueOnce(event)

      // Empty registrations array
      const updatedRegs: JsonRegistration[] = []

      const result = await updateRegistrations('e6', updatedRegs)

      // Verify database was not queried for registrations
      expect(mockQuery).not.toHaveBeenCalled()

      // Verify counts were updated to zero
      expect(result.entries).toBe(0)
      expect(result.members).toBe(0)

      // Verify class counts were updated to zero
      const aloClass = result.classes.find((c) => c.class === 'ALO')
      const avoClass = result.classes.find((c) => c.class === 'AVO')
      expect(aloClass?.entries).toBe(0)
      expect(aloClass?.members).toBe(0)
      expect(avoClass?.entries).toBe(0)
      expect(avoClass?.members).toBe(0)

      // Verify update was called with correct parameters
      expect(mockWriteEventFields).toHaveBeenCalledWith('e6', {
        set: {
          classes: result.classes,
          entries: 0,
          members: 0,
          updatedAt: result.updatedAt,
        },
      })
      expect(result.updatedAt).toEqual(expect.any(String))
    })

    it('throws LambdaError when event is not found', async () => {
      mockReadEvent.mockResolvedValueOnce(undefined)

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
      const group = { eventId: 'e4', group: { key: 'cancelled', number: 1 }, id: 'r1' }
      await saveGroup(group, { key: 'reserve', number: 1 }, { name: 'user' }, 'move', 'cancelled by user')

      // Verify update was called with correct parameters
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e4', id: 'r1' },
        {
          set: {
            cancelled: true,
            cancelReason: 'cancelled by user',
            group: { key: 'cancelled', number: 1 },
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )

      // Verify audit was called
      expect(mockAudit).toHaveBeenCalled()
    })

    // A guard: no row when neither side names a group. Today's callers always pass one, as
    // normalizeRegistrationGroups gives every registration a group (KOE-1511).
    it('writes no group row when neither side has a group', async () => {
      await saveGroup({ eventId: 'e6', id: 'r6' }, undefined, { name: 'user' }, 'move')

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('calls update without cancelReason for non-cancelled group', async () => {
      const group = {
        eventId: 'e5',
        group: { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 3, time: 'ip' as const },
        id: 'r2',
      }
      const previousGroup = { key: 'reserve', number: 1 }
      const user = { name: 'admin' }

      await saveGroup(group, previousGroup, user, 'move')

      // Verify update was called with correct parameters (no cancelReason)
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e5', id: 'r2' },
        {
          set: {
            cancelled: false,
            group: { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 3, time: 'ip' },
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )

      // The Finnish sentence for old readers, and the parts the trail names in the reader's language (KOE-1442)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'audit-key',
        messageKey: 'audit.messages.groupChanged',
        messageParams: {
          fromGroupKey: 'eventManagement.participantSelection.registered',
          fromNumber: 1,
          reasonKey: 'audit.groupReason.move',
          toDate: '2024-08-03',
          toNumber: 3,
          toTimeKey: 'audit.time.ip',
        },
        user: 'admin',
      })
    })

    it('removes cancelReason when moving out of the cancelled group', async () => {
      const group = { eventId: 'e5', group: { key: 'reserve', number: 1 }, id: 'r2' }

      await saveGroup(group, { key: 'cancelled', number: 1 }, { name: 'admin' }, 'move')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e5', id: 'r2' },
        {
          remove: ['cancelReason'],
          set: {
            cancelled: false,
            group: { key: 'reserve', number: 1 },
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )
    })

    it('handles case with no previous group', async () => {
      const group = { eventId: 'e6', group: { key: 'reserve', number: 2 }, id: 'r3' }
      const user = { name: 'secretary' }

      await saveGroup(group, undefined, user, 'automatic')

      // Verify update was called
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e6', id: 'r3' },
        {
          set: {
            cancelled: false,
            group: { key: 'reserve', number: 2 },
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )

      // Verify audit was called without the previous group info
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'audit-key',
        messageKey: 'audit.messages.groupSet',
        messageParams: {
          reasonKey: 'audit.groupReason.automatic',
          toGroupKey: 'eventManagement.participantSelection.registered',
          toNumber: 2,
        },
        user: 'secretary',
      })
    })

    it('handles cancelled group without cancelReason', async () => {
      const group = { eventId: 'e7', group: { key: 'cancelled', number: 5 }, id: 'r4' }
      const previousGroup = { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 10, time: 'ip' as const }
      const user = { name: 'organizer' }

      await saveGroup(group, previousGroup, user)

      // Verify update was called without cancelReason
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e7', id: 'r4' },
        {
          set: {
            cancelled: true,
            group: { key: 'cancelled', number: 5 },
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )

      // Verify audit was called
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'audit-key',
        messageKey: 'audit.messages.groupChanged',
        messageParams: {
          fromDate: '2024-08-03',
          fromNumber: 10,
          fromTimeKey: 'audit.time.ip',
          toGroupKey: 'eventManagement.participantSelection.cancelled',
          toNumber: 5,
        },
        user: 'organizer',
      })
    })
  })

  // fixRegistrationGroups
  describe('fixRegistrationGroups', () => {
    beforeEach(() => {
      mockUpdate.mockReset()
      mockAudit.mockReset()
    })

    it('fixes group numbers and calls saveGroup if save=true', async () => {
      const user = { name: 'user' }
      const regs = [
        { class: 'ALO', group: { key: 'A', number: 3 } },
        { class: 'ALO', group: { key: 'A', number: 1 } },
      ] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.number).toBe(2)
      expect(mockAudit).toHaveBeenCalled()
    })

    it('fixes group numbers but does not call saveGroup if save=false', async () => {
      const user = { name: 'user' }
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
      const user = { name: 'user' }
      const regs = [
        // First numbering group - ALO class
        { class: 'ALO', group: { key: 'A', number: 2 } },
        { class: 'ALO', group: { key: 'A', number: 5 } },
        // Second numbering group - AVO class
        { class: 'AVO', group: { key: 'B', number: 10 } },
        { class: 'AVO', group: { key: 'B', number: 3 } },
      ] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, false)

      // ALO class should be numbered 1, 2
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.number).toBe(2)

      // AVO class should be numbered 1, 2 (separate numbering)
      expect(result[2].group?.number).toBe(1)
      expect(result[3].group?.number).toBe(2)
    })

    it('updates group key if it has changed', async () => {
      const user = { name: 'user' }
      const regs = [
        {
          cancelled: true,
          class: 'ALO',
          eventId: 'event1',
          group: { key: 'old-key', number: 1 },
          id: 'reg1',
        },
      ] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group?.key).toBe('cancelled')
      expect(mockAudit).toHaveBeenCalled()
    })

    it('preserves additional group properties', async () => {
      const user = { name: 'user' }
      const regs = [
        {
          class: 'ALO',
          group: {
            date: '2024-08-02T21:00:00.000Z',
            key: 'A',
            number: 3,
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
      const user = { name: 'user' }
      const regs: JsonRegistration[] = []

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result).toEqual([])
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('handles single registration', async () => {
      const user = { name: 'user' }
      const regs = [{ class: 'ALO', group: { key: 'A', number: 5 } }] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group?.number).toBe(1)
      expect(mockAudit).toHaveBeenCalled()
    })

    it('skips update if group key and number are already correct', async () => {
      const user = { name: 'user' }
      const regs = [{ class: 'ALO', group: { key: 'A', number: 1 } }] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group?.number).toBe(1)
      expect(mockAudit).not.toHaveBeenCalled() // saveGroup should not be called
    })

    it('uses shared normalization ordering for missing group numbers', async () => {
      const user = { name: 'user' }
      const regs = [
        { class: 'ALO', group: { key: 'A', number: undefined }, id: 'unassigned' },
        { class: 'ALO', group: { key: 'A', number: 1000 }, id: 'numbered' },
      ] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, false)

      expect(result.map((registration) => registration.id)).toEqual(['numbered', 'unassigned'])
    })

    it('creates group property if it does not exist', async () => {
      const user = { name: 'user' }
      const regs = [
        { class: 'ALO', eventId: 'event1', id: 'reg1' }, // No group property
      ] as JsonRegistration[]

      const result = await fixRegistrationGroups(regs, user, true)

      expect(result[0].group).toBeDefined()
      expect(result[0].group?.key).toBe('reserve')
      expect(result[0].group?.number).toBe(1)
      expect(mockAudit).toHaveBeenCalled()
    })

    it('handles registrations with different dates and times', async () => {
      const user = { name: 'user' }
      mockAudit.mockClear()

      const regs = asJsonRegistrations([
        {
          class: 'ALO',
          group: { date: '2024-08-02', key: '2024-08-02-ap', number: 5, time: 'ap' },
        },
        {
          class: 'ALO',
          group: { date: '2024-08-02', key: '2024-08-02-ap', number: 3, time: 'ap' },
        },
        {
          class: 'ALO',
          group: { date: '2024-08-02', key: '2024-08-02-ip', number: 7, time: 'ip' },
        },
      ])

      const result = await fixRegistrationGroups(regs, user, false)

      // Morning group should be numbered 1, 2
      expect(result[0].group?.key).toBe('2024-08-02-ap')
      expect(result[0].group?.number).toBe(1)
      expect(result[1].group?.key).toBe('2024-08-02-ap')
      expect(result[1].group?.number).toBe(2)

      // Participant numbering continues across times on the same snapshot
      expect(result[2].group?.key).toBe('2024-08-02-ip')
      expect(result[2].group?.number).toBe(3)
    })

    it('handles special group keys like cancelled and reserve', async () => {
      const user = { name: 'user' }
      mockAudit.mockClear()

      const regs = asJsonRegistrations([
        { cancelled: true, class: 'ALO', group: { key: 'old', number: 3 } },
        { class: 'ALO', group: { key: 'reserve', number: 2 }, state: 'ready' },
      ])

      const result = await fixRegistrationGroups(regs, user, true)

      const cancelled = result.find((registration) => registration.cancelled)
      const reserve = result.find((registration) => !registration.cancelled)

      expect(cancelled?.group?.key).toBe('cancelled')
      expect(cancelled?.group?.number).toBe(1)
      expect(reserve?.group?.key).toBe('reserve')
      expect(reserve?.group?.number).toBe(1)

      expect(mockAudit).toHaveBeenCalledTimes(2)
      // The repair says it was the automatic placement, by key (KOE-1442).
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          messageParams: expect.objectContaining({ reasonKey: 'audit.groupReason.automatic' }),
        })
      )
    })
  })

  describe('patchEvent', () => {
    beforeEach(() => {
      mockWriteEventFields.mockReset()
      mockReadEvent.mockReset()
    })

    it('returns existing event and does nothing for no-op patch', async () => {
      const existing = { id: 'e1', name: 'Event' } as JsonDogEvent

      const result = await patchEvent(existing.id, existing, { ...existing })

      expect(result).toEqual({ event: existing })
      expect(mockWriteEventFields).not.toHaveBeenCalled()
      expect(mockReadEvent).not.toHaveBeenCalled()
    })

    it('reports the start list when the change is one its readers can see', async () => {
      const existing = {
        classes: [{ class: 'ALO', state: 'invited' }],
        id: 'e-published',
        organizer: { id: 'org-1', name: 'Org' },
        startListPublished: { ALO: false },
        state: 'invited',
      } as JsonDogEvent
      const next = { ...existing, startListPublished: { ALO: true } } as JsonDogEvent
      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(change?.startList).toBe(true)
    })

    it('leaves the start list out of a change no reader of it can see', async () => {
      const existing = {
        id: 'e-renamed',
        name: 'Old name',
        organizer: { id: 'org-1', name: 'Org' },
        state: 'confirmed',
      } as JsonDogEvent
      const next = { ...existing, name: 'New name' } as JsonDogEvent
      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(change?.startList).toBeUndefined()
    })

    it('updates set/remove fields and reports the patch', async () => {
      const existing = {
        id: 'e2',
        name: 'Old name',
        organizer: { id: 'org-1', name: 'Org' },
        qualificationStartDate: '2024-01-01T00:00:00Z',
      } as JsonDogEvent
      const next = {
        ...existing,
        name: 'New name',
        qualificationStartDate: undefined,
      } as JsonDogEvent
      const persisted = { ...next } as JsonDogEvent
      mockReadEvent.mockResolvedValueOnce(persisted)

      const result = await patchEvent(existing.id, existing, next)

      expect(mockWriteEventFields).toHaveBeenCalledWith(existing.id, {
        remove: ['qualificationStartDate'],
        set: { name: 'New name' },
      })
      expect(result.change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { eventId: existing.id, name: 'New name', qualificationStartDate: undefined },
      })
      expect(result.event).toEqual(persisted)
    })

    it('updates nested field changes partially and reports the nested patch', async () => {
      const existing = {
        contactInfo: {
          secretary: { email: 'old@example.com', name: 'Secretary' },
        },
        id: 'e3',
        organizer: { id: 'org-1', name: 'Org' },
      } as JsonDogEvent

      const next = {
        ...existing,
        contactInfo: {
          secretary: { email: 'new@example.com', name: 'Secretary' },
        },
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(mockWriteEventFields).toHaveBeenCalledWith(existing.id, {
        set: {
          'contactInfo.secretary.email': 'new@example.com',
        },
      })

      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { contactInfo: { secretary: { email: 'new@example.com' } }, eventId: existing.id },
      })
    })

    it('replaces changed arrays instead of persisting sparse array diffs', async () => {
      const existing = {
        classes: [
          { class: 'ALO', entries: 1, members: 0 },
          { class: 'AVO', entries: 2, members: 0 },
        ],
        id: 'e4',
        organizer: { id: 'org-1', name: 'Org' },
      } as JsonDogEvent

      const next = {
        ...existing,
        classes: [
          { class: 'ALO', entries: 3, members: 0 },
          { class: 'AVO', entries: 2, members: 0 },
        ],
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(mockWriteEventFields).toHaveBeenCalledWith(existing.id, {
        set: {
          classes: next.classes,
        },
      })
      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { classes: next.classes, eventId: existing.id },
        startList: true,
      })
    })

    it('reports full replacement arrays when array length changes', async () => {
      const existing = {
        classes: [{ class: 'ALO', entries: 1, members: 0 }],
        id: 'e5',
        judges: [{ id: 842408, name: 'Fontell Ari-Pekka', official: true }],
        organizer: { id: 'org-1', name: 'Org' },
      } as JsonDogEvent

      const next = {
        ...existing,
        classes: [],
        judges: [
          { id: 842408, name: 'Fontell Ari-Pekka', official: true },
          { id: 653323, name: 'Uusimäki Pekka', official: true },
        ],
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { classes: next.classes, eventId: existing.id, judges: next.judges },
        startList: true,
      })
    })

    it('reports full nested replacement arrays', async () => {
      const existing = {
        classes: [
          { class: 'ALO', judge: [{ id: 842408, name: 'Fontell Ari-Pekka', official: true }] },
          { class: 'AVO', judge: [{ id: 653323, name: 'Uusimäki Pekka', official: true }] },
        ],
        id: 'e6',
        organizer: { id: 'org-1', name: 'Org' },
      } as JsonDogEvent

      const next = {
        ...existing,
        classes: [
          {
            class: 'ALO',
            judge: [
              { id: 842408, name: 'Fontell Ari-Pekka', official: true },
              { id: 653323, name: 'Uusimäki Pekka', official: true },
            ],
          },
          { class: 'AVO', judge: [{ id: 653323, name: 'Uusimäki Pekka', official: true }] },
        ],
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { classes: next.classes, eventId: existing.id },
        startList: true,
      })
    })

    it('reports the whole event when a draft becomes public', async () => {
      const existing = {
        classes: [{ class: 'ALO', date: '2026-06-01', entries: 0, members: 0 }],
        cost: 10,
        description: 'Description',
        endDate: '2026-06-01',
        eventType: 'NOME-B',
        id: 'e7',
        judges: [{ id: 842408, name: 'Fontell Ari-Pekka', official: true }],
        location: 'Helsinki',
        name: 'Draft event',
        official: { id: 'official-1', name: 'Official' },
        organizer: { id: 'org-1', name: 'Org' },
        places: 10,
        secretary: { id: 'secretary-1', name: 'Secretary' },
        startDate: '2026-06-01',
        state: 'draft',
      } as JsonDogEvent
      const next = {
        ...existing,
        state: 'tentative',
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(mockWriteEventFields).toHaveBeenCalledWith(existing.id, {
        set: { state: 'tentative' },
      })
      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { eventId: existing.id, ...next },
        startList: true,
      })
    })

    it('reports an admin-only change when a draft stays a draft', async () => {
      const existing = {
        id: 'e8',
        name: 'Draft event',
        organizer: { id: 'org-1', name: 'Org' },
        state: 'draft',
      } as JsonDogEvent
      const next = {
        ...existing,
        name: 'Updated draft event',
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(change).toEqual({
        audience: 'admin',
        organizerId: 'org-1',
        patch: { eventId: existing.id, name: 'Updated draft event' },
      })
    })

    it('reports a public change when a public event becomes a draft', async () => {
      const existing = {
        id: 'e9',
        name: 'Public event',
        organizer: { id: 'org-1', name: 'Org' },
        state: 'tentative',
      } as JsonDogEvent
      const next = {
        ...existing,
        state: 'draft',
      } as JsonDogEvent

      mockReadEvent.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      // Visibility is a start-list field, so its readers need the rebuilt list as well.
      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { eventId: existing.id, state: 'draft' },
        startList: true,
      })
    })
  })

  // saveEvent
  describe('saveEvent', () => {
    beforeEach(() => {
      mockWriteEvent.mockReset()
    })
    it("writes the event and reports a draft as the organizer's business alone", async () => {
      const event = { id: 'e6', name: 'Event', organizer: { id: 'org-1' }, state: 'draft' } as JsonDogEvent

      const change = await saveEvent(event)

      expect(mockWriteEvent).toHaveBeenCalledWith(event)
      expect(change).toEqual({
        audience: 'admin',
        organizerId: 'org-1',
        patch: { ...event, eventId: event.id },
      })
    })

    it('reports a published event to everyone, start list and all', async () => {
      const event = { id: 'e7', name: 'Event', organizer: { id: 'org-1' }, state: 'confirmed' } as JsonDogEvent

      const change = await saveEvent(event)

      expect(change).toEqual({
        audience: 'public',
        organizerId: 'org-1',
        patch: { ...event, eventId: event.id },
        startList: true,
      })
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

  describe('setResultsPublishedState', () => {
    // A two-day trial whose list is out, on its second day: both days have begun.
    const twoDays = asJsonConfirmedEvent({
      classes: [
        { class: 'ALO', date: '2026-09-12' },
        { class: 'ALO', date: '2026-09-13' },
      ],
      endDate: '2026-09-13',
      id: 'event-1',
      resultsPublished: { ALO: ['2026-09-12'] },
      startDate: '2026-09-12',
      startListPublished: true,
      state: 'invited',
      updatedAt: '2026-09-13T04:00:00.000Z',
    })
    const now = new Date('2026-09-13T15:00:00.000Z')
    const conflict = () => Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' })

    beforeEach(() => {
      mockWriteResultsPublished.mockReset()
      mockReadEvent.mockReset()
      vi.useFakeTimers({ now, toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('folds the day into the flag as read and answers with the flag the row holds (KOE-1510)', async () => {
      // Another secretary's AVO publish landed meanwhile: the stored row has it, the reading did not.
      mockWriteResultsPublished.mockResolvedValueOnce({ ALO: ['2026-09-12', '2026-09-13'], AVO: true })

      const saved = await setResultsPublishedState(
        twoDays,
        { date: '2026-09-13', eventClass: 'ALO', published: true },
        now
      )

      expect(mockWriteResultsPublished).toHaveBeenCalledWith(
        'event-1',
        'ALO',
        { ALO: ['2026-09-12'] },
        { ALO: ['2026-09-12', '2026-09-13'] },
        '2026-09-13T15:00:00.000Z'
      )
      expect(saved).toMatchObject({
        id: 'event-1',
        resultsPublished: { ALO: ['2026-09-12', '2026-09-13'], AVO: true },
        updatedAt: '2026-09-13T15:00:00.000Z',
      })
    })

    it('hands a flag that is not yet a map over as read', async () => {
      mockWriteResultsPublished.mockResolvedValueOnce({ ALO: ['2026-09-12'] })

      await setResultsPublishedState(
        { ...twoDays, resultsPublished: true },
        { date: '2026-09-13', eventClass: 'ALO', published: false },
        now
      )

      expect(mockWriteResultsPublished).toHaveBeenCalledWith(
        'event-1',
        'ALO',
        true,
        { ALO: ['2026-09-12'] },
        '2026-09-13T15:00:00.000Z'
      )
    })

    it('reads the row again after a conflict and folds the day into it afresh', async () => {
      // Someone hid Saturday meanwhile; publishing Sunday must not bring Saturday back.
      mockWriteResultsPublished.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ ALO: ['2026-09-13'] })
      mockReadEvent.mockResolvedValueOnce({ ...twoDays, resultsPublished: { ALO: false } })

      const saved = await setResultsPublishedState(
        twoDays,
        { date: '2026-09-13', eventClass: 'ALO', published: true },
        now
      )

      expect(mockReadEvent).toHaveBeenCalledWith('event-1', true)
      expect(mockWriteResultsPublished).toHaveBeenLastCalledWith(
        'event-1',
        'ALO',
        { ALO: false },
        { ALO: ['2026-09-13'] },
        '2026-09-13T15:00:00.000Z'
      )
      expect(saved.resultsPublished).toEqual({ ALO: ['2026-09-13'] })
    })

    it('judges the rules again on the row read after a conflict', async () => {
      // The start list was hidden meanwhile: the publish is refused rather than written.
      mockWriteResultsPublished.mockRejectedValueOnce(conflict())
      mockReadEvent.mockResolvedValueOnce({ ...twoDays, startListPublished: false })

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-13', eventClass: 'ALO', published: true }, now)
      ).rejects.toMatchObject({ body: { publish: 'results', reason: 'startList' }, status: 422 })
      expect(mockWriteResultsPublished).toHaveBeenCalledTimes(1)
    })

    it('refuses as a conflict only once the attempts run out', async () => {
      mockWriteResultsPublished.mockRejectedValue(conflict())
      mockReadEvent.mockResolvedValue(twoDays)

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-12', eventClass: 'ALO', published: false }, now)
      ).rejects.toMatchObject({ body: { error: 'resultsPublishedChanged' }, status: 409 })
      expect(mockWriteResultsPublished).toHaveBeenCalledTimes(3)
    })

    it('lets any other failed write through rather than claiming the change', async () => {
      mockWriteResultsPublished.mockRejectedValueOnce(new Error('throttled'))

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-13', eventClass: 'ALO', published: true }, now)
      ).rejects.toThrow('throttled')
    })

    it('does not answer for a row that came back without a flag', async () => {
      mockWriteResultsPublished.mockResolvedValueOnce(undefined)

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-13', eventClass: 'ALO', published: true }, now)
      ).rejects.toThrow('the written row holds no results flag')
    })
  })
})
