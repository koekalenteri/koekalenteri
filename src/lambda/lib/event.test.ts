import type { DeepPartial, JsonConfirmedEvent, JsonDogEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { PRIORITY_MEMBER } from '../../lib/priority'

const mockQuery = vi.fn()
const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockUpdate = vi.fn()
const mockWrite = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockQuery,
      read: mockRead,
      readAll: mockReadAll,
      update: mockUpdate,
      write: mockWrite,
    }
  }),
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
  findQualificationStartDate,
  fixRegistrationGroups,
  getEvent,
  getStateFromTemplate,
  lockKcState,
  lockRegistrationGroups,
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
    mockUpdate.mockReset()
  })

  afterEach(() => {
    mockUpdate.mockReset()
  })

  describe('writeKcState', () => {
    it('writes the state field by field, on condition that no newer reading is stored and no fresh lock is lifted', async () => {
      mockUpdate.mockResolvedValueOnce(undefined)

      await expect(writeKcState('event-1', state, state.readAt)).resolves.toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcState: state, updatedAt: state.readAt } },
        expect.anything(),
        'NONE',
        {
          expression:
            'attribute_exists(#id) AND (attribute_not_exists(#kcState) OR (#kcState.#readAt <= :readAt AND (:code = :handedOver OR #kcState.#code <> :handedOver OR #kcState.#readAt <= :freshAfter)))',
          names: { '#code': 'code', '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
          // A handed-over state younger than thirty seconds (longer than a request lives) stays against a reading of another state.
          values: {
            ':code': 1253,
            ':freshAfter': '2026-09-26T09:59:30.000Z',
            ':handedOver': 1253,
            ':readAt': state.readAt,
          },
        }
      )
    })

    it('measures the window from the reading it writes, for a reading of another state', async () => {
      mockUpdate.mockResolvedValueOnce(undefined)
      const open = { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T10:01:00.000Z' }

      await writeKcState('event-1', open, open.readAt)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        expect.anything(),
        expect.anything(),
        'NONE',
        expect.objectContaining({
          values: {
            ':code': 754,
            ':freshAfter': '2026-09-26T10:00:30.000Z',
            ':handedOver': 1253,
            ':readAt': open.readAt,
          },
        })
      )
    })

    it('answers false when a newer reading is stored, and lets any other failure through', async () => {
      mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(writeKcState('event-1', state, state.readAt)).resolves.toBe(false)

      mockUpdate.mockRejectedValueOnce(new Error('throttled'))
      await expect(writeKcState('event-1', state, state.readAt)).rejects.toThrow('throttled')
    })
  })

  describe('lockKcState', () => {
    it('takes the lock only where no handed-over state is stored and no newer reading is', async () => {
      mockUpdate.mockResolvedValueOnce(undefined)

      await expect(lockKcState('event-1', state, 1253)).resolves.toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcState: state, updatedAt: state.readAt } },
        expect.anything(),
        'NONE',
        {
          expression:
            'attribute_exists(#id) AND (attribute_not_exists(#kcState) OR (#kcState.#code <> :handedOver AND #kcState.#readAt <= :readAt))',
          names: { '#code': 'code', '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
          values: { ':handedOver': 1253, ':readAt': state.readAt },
        }
      )
    })

    it('answers false when another hand-over holds the lock, and lets any other failure through', async () => {
      mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(lockKcState('event-1', state, 1253)).resolves.toBe(false)

      mockUpdate.mockRejectedValueOnce(new Error('throttled'))
      await expect(lockKcState('event-1', state, 1253)).rejects.toThrow('throttled')
    })
  })

  describe('releaseKcState', () => {
    const restored = { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T10:00:05.000Z' }

    it('gives the state back only while the stored one is the lock it wrote', async () => {
      mockUpdate.mockResolvedValueOnce(undefined)

      await expect(releaseKcState('event-1', restored, state.readAt, restored.readAt)).resolves.toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcState: restored, updatedAt: restored.readAt } },
        expect.anything(),
        'NONE',
        {
          expression: 'attribute_exists(#id) AND #kcState.#readAt = :lockedAt',
          names: { '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
          values: { ':lockedAt': state.readAt },
        }
      )
    })

    it('answers false when the stored state is not the lock, and lets any other failure through', async () => {
      mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(releaseKcState('event-1', restored, state.readAt, restored.readAt)).resolves.toBe(false)

      mockUpdate.mockRejectedValueOnce(new Error('throttled'))
      await expect(releaseKcState('event-1', restored, state.readAt, restored.readAt)).rejects.toThrow('throttled')
    })
  })

  describe('writeKcGuid', () => {
    it('links only an event that has no link, and answers false when it has one', async () => {
      mockUpdate.mockResolvedValueOnce(undefined)
      await expect(writeKcGuid('event-1', 'guid-1', '2026-09-26T10:00:00.000Z')).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { kcGuid: 'guid-1', updatedAt: '2026-09-26T10:00:00.000Z' } },
        expect.anything(),
        'NONE',
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#kcGuid)',
          names: { '#id': 'id', '#kcGuid': 'kcGuid' },
        }
      )

      mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(writeKcGuid('event-1', 'guid-2', '2026-09-26T10:00:00.000Z')).resolves.toBe(false)
    })
  })
})

describe('lib/event', () => {
  describe('lockRegistrationGroups', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('retries acquisition with backoff and ignores release after lease takeover', async () => {
      vi.useFakeTimers()
      mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' }).mockResolvedValueOnce(undefined)

      const lockPromise = lockRegistrationGroups('event-1', 1)
      await vi.advanceTimersByTimeAsync(100)
      const release = await lockPromise

      expect(mockUpdate).toHaveBeenCalledTimes(2)
      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { id: 'event-1' },
        expect.objectContaining({ set: expect.objectContaining({ registrationGroupsLock: expect.anything() }) }),
        expect.anything(),
        undefined,
        expect.objectContaining({ expression: expect.stringContaining('attribute_not_exists') })
      )

      mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      await expect(release()).resolves.toBeUndefined()
    })
  })

  describe('findQualificationStartDate', () => {
    it('should call query with proper arguments', async () => {
      await findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())

      expect(mockQuery).toHaveBeenCalledWith({
        forward: false,
        index: 'gsiEventTypeEntryEndDate',
        key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
        limit: 1,
        table: 'event-table-not-found-in-env',
        values: { ':entryEndDate': '2025-03-22T17:00:00.000Z', ':eventType': 'NOME-B SM' },
      })
    })
    it.each([undefined, [], [{}], [1, 2]])('should return undefined when query returns %p', async (result) => {
      mockQuery.mockResolvedValueOnce(result)
      await expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toBeUndefined()
    })

    it('should return start of next day from the entryEndDate', async () => {
      mockQuery.mockResolvedValueOnce([{ entryEndDate: '2024-08-20T23:59:59.999+03:00' }])
      await expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toEqual('2024-08-21T00:00:00.000+03:00')
    })

    it('should prefer entryOrigEndDate when available ', async () => {
      mockQuery.mockResolvedValueOnce([
        { entryEndDate: '2024-08-20T23:59:59.999+03:00', entryOrigEndDate: '2024-08-15T23:59:59.999+03:00' },
      ])
      await expect(
        findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
      ).resolves.toEqual('2024-08-16T00:00:00.000+03:00')
    })
  })

  describe('findEventWithKcGuid (KOE-1534)', () => {
    const GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'

    beforeEach(() => {
      mockReadAll.mockReset()
    })

    it('scans the event table for the GUID', async () => {
      mockReadAll.mockResolvedValueOnce([])

      await findEventWithKcGuid(GUID)

      expect(mockReadAll).toHaveBeenCalledWith({
        filter: 'kcGuid = :kcGuid',
        projection: 'id',
        table: expect.any(String),
        values: { ':kcGuid': GUID },
      })
    })

    it('returns the other event that has the GUID', async () => {
      mockReadAll.mockResolvedValueOnce([{ id: 'this' }, { id: 'other' }])

      await expect(findEventWithKcGuid(GUID, 'this')).resolves.toEqual({ id: 'other' })
    })

    it('finds no conflict when the only match is the event itself or nothing matches', async () => {
      mockReadAll.mockResolvedValueOnce([{ id: 'this' }]).mockResolvedValueOnce(undefined)

      await expect(findEventWithKcGuid(GUID, 'this')).resolves.toBeUndefined()
      await expect(findEventWithKcGuid(GUID, 'this')).resolves.toBeUndefined()
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
      expect(mockRead).toHaveBeenCalledWith({ id: eventId }, expect.anything(), false)
    })

    it('reads the row as last written when asked to (KOE-1510)', async () => {
      mockRead.mockResolvedValueOnce(eventObj)
      await getEvent(eventId, true)
      expect(mockRead).toHaveBeenCalledWith({ id: eventId }, expect.anything(), true)
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
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e1' },
        {
          set: {
            classes: event.classes,
            startListPublished: false,
            state: event.state,
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )
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
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'new-event' },
        {
          set: {
            classes: event.classes,
            startListPublished: false,
            state: event.state,
            updatedAt: expect.any(String),
          },
        },
        expect.anything()
      )
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
      expect(mockUpdate).toHaveBeenCalledTimes(2)
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
      mockUpdate.mockReset()
      mockQuery.mockReset()
      mockRead.mockReset()
    })

    it('updates event entries and members', async () => {
      const event = {
        classes: [{ class: 'ALO' }, { class: 'AVO' }],
        id: 'e3',
        organizer: { id: 'org-1' },
        state: 'ready',
      }
      mockRead.mockResolvedValueOnce(event)
      const regs = [
        { cancelled: false, class: 'ALO', eventId: 'e3', id: 'r1', paidAmount: 1, state: 'ready' },
        { cancelled: false, class: 'AVO', eventId: 'e3', id: 'r2', paidAmount: 0, state: 'ready' },
      ] as JsonRegistration[]
      mockQuery.mockResolvedValueOnce(regs)

      const result = await updateRegistrations('e3')
      expect(result.entries).toBe(2)
      expect(result.modifiedAt).toBeUndefined()
      expect(result.updatedAt).toEqual(expect.any(String))
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e3' },
        {
          set: {
            classes: result.classes,
            entries: 2,
            members: 0,
            updatedAt: result.updatedAt,
          },
        },
        expect.anything()
      )
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
      mockRead.mockResolvedValueOnce(event)

      // Set up registrations that would result in the same counts
      const regs = [
        { cancelled: false, class: 'ALO', paidAmount: 1, state: 'ready' },
        { cancelled: false, class: 'AVO', handler: { membership: true }, paidAmount: 0, state: 'ready' },
      ]
      mockQuery.mockResolvedValueOnce(regs)

      await updateRegistrations('e4')

      // Verify that no update was performed
      expect(mockUpdate).not.toHaveBeenCalled()
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
      mockRead.mockResolvedValueOnce(event)

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
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e5' },
        {
          set: {
            classes: result.classes,
            entries: 3,
            members: 1,
            updatedAt: result.updatedAt,
          },
        },
        expect.anything()
      )

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
      const aloClass = result.classes.find((c) => c.class === 'ALO')
      const avoClass = result.classes.find((c) => c.class === 'AVO')
      expect(aloClass?.entries).toBe(0)
      expect(aloClass?.members).toBe(0)
      expect(avoClass?.entries).toBe(0)
      expect(avoClass?.members).toBe(0)

      // Verify update was called with correct parameters
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'e6' },
        {
          set: {
            classes: result.classes,
            entries: 0,
            members: 0,
            updatedAt: result.updatedAt,
          },
        },
        expect.anything()
      )
      expect(result.updatedAt).toEqual(expect.any(String))
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
      mockUpdate.mockReset()
      mockRead.mockReset()
    })

    it('returns existing event and does nothing for no-op patch', async () => {
      const existing = { id: 'e1', name: 'Event' } as JsonDogEvent

      const result = await patchEvent(existing.id, existing, { ...existing })

      expect(result).toEqual({ event: existing })
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockRead).not.toHaveBeenCalled()
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
      mockRead.mockResolvedValueOnce(next)

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
      mockRead.mockResolvedValueOnce(next)

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
      mockRead.mockResolvedValueOnce(persisted)

      const result = await patchEvent(existing.id, existing, next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: existing.id },
        {
          remove: ['qualificationStartDate'],
          set: { name: 'New name' },
        },
        expect.anything()
      )
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

      mockRead.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: existing.id },
        {
          set: {
            'contactInfo.secretary.email': 'new@example.com',
          },
        },
        expect.anything()
      )

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

      mockRead.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: existing.id },
        {
          set: {
            classes: next.classes,
          },
        },
        expect.anything()
      )
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

      mockRead.mockResolvedValueOnce(next)

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

      mockRead.mockResolvedValueOnce(next)

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

      mockRead.mockResolvedValueOnce(next)

      const { change } = await patchEvent(existing.id, existing, next)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: existing.id },
        {
          set: { state: 'tentative' },
        },
        expect.anything()
      )
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

      mockRead.mockResolvedValueOnce(next)

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

      mockRead.mockResolvedValueOnce(next)

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
      mockWrite.mockReset()
    })
    it("writes the event and reports a draft as the organizer's business alone", async () => {
      const event = { id: 'e6', name: 'Event', organizer: { id: 'org-1' }, state: 'draft' } as JsonDogEvent

      const change = await saveEvent(event)

      expect(mockWrite).toHaveBeenCalledWith(event, expect.anything())
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
    const written = (resultsPublished: unknown) => ({ Attributes: { id: 'event-1', resultsPublished } })
    const conflict = () => Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' })

    beforeEach(() => {
      mockUpdate.mockReset()
      mockRead.mockReset()
      vi.useFakeTimers({ now, toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('writes only the class entry of a stored map, held to the entry it was folded from (KOE-1510)', async () => {
      // Another secretary's AVO publish landed meanwhile: the stored row has it, the reading did not.
      mockUpdate.mockResolvedValueOnce(written({ ALO: ['2026-09-12', '2026-09-13'], AVO: true }))

      const saved = await setResultsPublishedState(
        twoDays,
        { date: '2026-09-13', eventClass: 'ALO', published: true },
        now
      )

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { 'resultsPublished.ALO': ['2026-09-12', '2026-09-13'], updatedAt: '2026-09-13T15:00:00.000Z' } },
        expect.any(String),
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND #resultsPublished.#resultsClass = :foldedFrom',
          names: { '#id': 'id', '#resultsClass': 'ALO', '#resultsPublished': 'resultsPublished' },
          values: { ':foldedFrom': ['2026-09-12'] },
        }
      )
      expect(saved).toMatchObject({
        id: 'event-1',
        resultsPublished: { ALO: ['2026-09-12', '2026-09-13'], AVO: true },
        updatedAt: '2026-09-13T15:00:00.000Z',
      })
    })

    it('holds a class missing from the map to still being missing', async () => {
      // An entry never written is absent, not false: a condition on false would never hold.
      const withAvo = asJsonConfirmedEvent({
        ...twoDays,
        classes: [...twoDays.classes, { class: 'AVO', date: '2026-09-12' }],
      })
      mockUpdate.mockResolvedValueOnce(written({ ALO: ['2026-09-12'], AVO: ['2026-09-12'] }))

      await setResultsPublishedState(withAvo, { date: '2026-09-12', eventClass: 'AVO', published: true }, now)

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { 'resultsPublished.AVO': ['2026-09-12'], updatedAt: '2026-09-13T15:00:00.000Z' } },
        expect.any(String),
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#resultsPublished.#resultsClass)',
          names: { '#id': 'id', '#resultsClass': 'AVO', '#resultsPublished': 'resultsPublished' },
        }
      )
    })

    it('writes a flag that is not yet a map whole, held to the flag as read', async () => {
      mockUpdate.mockResolvedValueOnce(written({ ALO: ['2026-09-12'] }))

      await setResultsPublishedState(
        { ...twoDays, resultsPublished: true },
        { date: '2026-09-13', eventClass: 'ALO', published: false },
        now
      )

      expect(mockUpdate).toHaveBeenCalledWith(
        { id: 'event-1' },
        { set: { resultsPublished: { ALO: ['2026-09-12'] }, updatedAt: '2026-09-13T15:00:00.000Z' } },
        expect.any(String),
        'ALL_NEW',
        {
          expression: 'attribute_exists(#id) AND #resultsPublished = :foldedFrom',
          names: { '#id': 'id', '#resultsPublished': 'resultsPublished' },
          values: { ':foldedFrom': true },
        }
      )
    })

    it('reads the row again after a conflict and folds the day into it afresh', async () => {
      // Someone hid Saturday meanwhile; publishing Sunday must not bring Saturday back.
      mockUpdate.mockRejectedValueOnce(conflict()).mockResolvedValueOnce(written({ ALO: ['2026-09-13'] }))
      mockRead.mockResolvedValueOnce({ ...twoDays, resultsPublished: { ALO: false } })

      const saved = await setResultsPublishedState(
        twoDays,
        { date: '2026-09-13', eventClass: 'ALO', published: true },
        now
      )

      expect(mockRead).toHaveBeenCalledWith({ id: 'event-1' }, expect.any(String), true)
      expect(mockUpdate).toHaveBeenLastCalledWith(
        { id: 'event-1' },
        { set: { 'resultsPublished.ALO': ['2026-09-13'], updatedAt: '2026-09-13T15:00:00.000Z' } },
        expect.any(String),
        'ALL_NEW',
        expect.objectContaining({ values: { ':foldedFrom': false } })
      )
      expect(saved.resultsPublished).toEqual({ ALO: ['2026-09-13'] })
    })

    it('judges the rules again on the row read after a conflict', async () => {
      // The start list was hidden meanwhile: the publish is refused rather than written.
      mockUpdate.mockRejectedValueOnce(conflict())
      mockRead.mockResolvedValueOnce({ ...twoDays, startListPublished: false })

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-13', eventClass: 'ALO', published: true }, now)
      ).rejects.toMatchObject({ body: { publish: 'results', reason: 'startList' }, status: 422 })
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    it('refuses as a conflict only once the attempts run out', async () => {
      mockUpdate.mockRejectedValue(conflict())
      mockRead.mockResolvedValue(twoDays)

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-12', eventClass: 'ALO', published: false }, now)
      ).rejects.toMatchObject({ body: { error: 'resultsPublishedChanged' }, status: 409 })
      expect(mockUpdate).toHaveBeenCalledTimes(3)
    })

    it('lets any other failed write through rather than claiming the change', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('throttled'))

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-13', eventClass: 'ALO', published: true }, now)
      ).rejects.toThrow('throttled')
    })

    it('does not answer for a row that came back without a flag', async () => {
      mockUpdate.mockResolvedValueOnce({ Attributes: { id: 'event-1' } })

      await expect(
        setResultsPublishedState(twoDays, { date: '2026-09-13', eventClass: 'ALO', published: true }, now)
      ).rejects.toThrow('the written row holds no results flag')
    })
  })
})
