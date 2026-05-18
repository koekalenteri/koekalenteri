import type { JsonConfirmedEvent, JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'
import type { GroupChangeNotifier, SyncAggregatesPort } from './api'
import type { RegistrationRepository } from './repository'
import { jest } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock ./groups to avoid real DynamoDB calls (saveGroup + fixRegistrationGroups
// are direct module-level imports in actions.ts, not injectable ports).
// ---------------------------------------------------------------------------

const mockFixRegistrationGroups = jest.fn<any>()
const mockSaveGroup = jest.fn<any>()

jest.unstable_mockModule('./groups', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  saveGroup: mockSaveGroup,
}))

const { createApplyGroupChanges } = await import('./actions')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent =>
  ({
    classes: [{ class: 'ALO', date: '2030-06-01', entries: 0, members: 0, time: 'ap' }],
    entries: 0,
    entryEndDate: '2030-05-31',
    entryStartDate: '2025-01-01',
    id: 'event123',
    members: 0,
    organizer: { id: 'org123', name: 'Test Organizer' },
    paymentTime: 'registration',
    places: 10,
    state: 'confirmed',
    ...overrides,
  }) as unknown as JsonConfirmedEvent

const makeRegistration = (overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    cancelled: false,
    class: 'ALO',
    createdAt: '2025-04-01T10:00:00.000Z',
    createdBy: 'user1',
    dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
    eventId: 'event123',
    group: { key: 'reserve', number: 1 },
    handler: { email: 'handler@example.com', name: 'Handler' },
    id: 'reg456',
    language: 'fi',
    modifiedAt: '2025-04-01T10:00:00.000Z',
    modifiedBy: 'user1',
    owner: { email: 'owner@example.com', name: 'Owner' },
    payer: { email: 'payer@example.com', name: 'Payer' },
    state: 'ready',
    ...overrides,
  }) as unknown as JsonRegistration

/** Minimal valid group info for a reserve slot */
const makeGroupInfo = (id: string, group: JsonRegistrationGroupInfo['group']): JsonRegistrationGroupInfo => ({
  cancelled: false,
  eventId: 'event123',
  group,
  id,
})

/** Minimal valid group info for a participant (dated) slot */
const makeParticipantGroupInfo = (id: string): JsonRegistrationGroupInfo => ({
  cancelled: false,
  eventId: 'event123',
  group: { date: '2030-06-01', key: '2030-06-01-ap', number: 1, time: 'ap' },
  id,
})

const makeRepo = (overrides: Partial<RegistrationRepository> = {}): RegistrationRepository => ({
  create: jest.fn(async () => undefined) as unknown as RegistrationRepository['create'],
  findExistingForDog: jest.fn(async () => undefined) as unknown as RegistrationRepository['findExistingForDog'],
  getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
  listByEventId: jest.fn(async () => []) as unknown as RegistrationRepository['listByEventId'],
  listReadyByEventId: jest.fn(async () => []) as unknown as RegistrationRepository['listReadyByEventId'],
  patch: jest.fn(async () => undefined) as unknown as RegistrationRepository['patch'],
  patchGroup: jest.fn(async () => undefined) as unknown as RegistrationRepository['patchGroup'],
  patchPaymentState: jest.fn(async () => undefined) as unknown as RegistrationRepository['patchPaymentState'],
  patchRefundState: jest.fn(async () => undefined) as unknown as RegistrationRepository['patchRefundState'],
  ...overrides,
})

const makeSync = (event: JsonConfirmedEvent = makeEvent()): SyncAggregatesPort => ({
  syncEventAggregates: jest.fn(async () => ({
    changed: true,
    event,
  })) as unknown as SyncAggregatesPort['syncEventAggregates'],
})

const makeNotifier = (): GroupChangeNotifier => ({
  sendCancelledEmails: jest.fn(async () => ({
    failed: [],
    ok: [],
  })) as unknown as GroupChangeNotifier['sendCancelledEmails'],
  sendInvitedEmails: jest.fn(async () => ({
    failed: [],
    ok: [],
  })) as unknown as GroupChangeNotifier['sendInvitedEmails'],
  sendPickedEmails: jest.fn(async () => ({ failed: [], ok: [] })) as unknown as GroupChangeNotifier['sendPickedEmails'],
  sendReserveEmails: jest.fn(async () => ({
    failed: [],
    ok: [],
  })) as unknown as GroupChangeNotifier['sendReserveEmails'],
  updateReserveNotified: jest.fn(async () => undefined) as unknown as GroupChangeNotifier['updateReserveNotified'],
})

const makeUser = (): JsonUser => ({ id: 'admin1', name: 'Admin User' }) as JsonUser

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks()
  // Default: fixRegistrationGroups is a pass-through (no-save)
  mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) => regs)
  mockSaveGroup.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('createApplyGroupChanges – happy path', () => {
  it('calls repo.listReadyByEventId with the eventId', async () => {
    const event = makeEvent()
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const repo = makeRepo({
      listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
    })
    const action = createApplyGroupChanges({ notifier: makeNotifier(), repo, sync: makeSync(event) })

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(repo.listReadyByEventId).toHaveBeenCalledWith('event123')
  })

  it('calls sync.syncEventAggregates after group updates', async () => {
    const event = makeEvent()
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const syncPort = makeSync(event)
    const action = createApplyGroupChanges({
      notifier: makeNotifier(),
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: syncPort,
    })

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(syncPort.syncEventAggregates).toHaveBeenCalledWith('event123')
  })

  it('returns confirmedEvent from syncEventAggregates', async () => {
    const syncedEvent = makeEvent({ entries: 5 })
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const action = createApplyGroupChanges({
      notifier: makeNotifier(),
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(syncedEvent),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(result.confirmedEvent.entries).toBe(5)
  })

  it('returns updatedItems with all registrations', async () => {
    const event = makeEvent()
    const reg1 = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const reg2 = makeRegistration({ group: { key: 'reserve', number: 2 }, id: 'reg2' })
    const action = createApplyGroupChanges({
      notifier: makeNotifier(),
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [
          reg1,
          reg2,
        ]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(result.updatedItems).toHaveLength(2)
  })

  it('applies in-memory group updates from eventGroups', async () => {
    const event = makeEvent()
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg456' })
    const action = createApplyGroupChanges({
      notifier: makeNotifier(),
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg456', { key: 'reserve', number: 2 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    const updated = result.updatedItems.find((r) => r.id === 'reg456')
    expect(updated?.group?.key).toBe('reserve')
  })
})

// ---------------------------------------------------------------------------
// Email fanout – picked state
// ---------------------------------------------------------------------------

describe('createApplyGroupChanges – email fanout for picked event', () => {
  it('calls notifier.sendPickedEmails when event state is picked and registrations move from reserve', async () => {
    const event = makeEvent({ state: 'picked' })
    // Old registration is in reserve
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    // Move reg from reserve to a participant group (date-based key)
    await action({
      eventGroups: [makeParticipantGroupInfo('reg1')],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendPickedEmails).toHaveBeenCalled()
  })

  it('does not call notifier.sendPickedEmails when event state is confirmed', async () => {
    const event = makeEvent({ state: 'confirmed' })
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    await action({
      eventGroups: [makeParticipantGroupInfo('reg1')],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendPickedEmails).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Email fanout – invited state
// ---------------------------------------------------------------------------

describe('createApplyGroupChanges – email fanout for invited event', () => {
  it('calls notifier.sendInvitedEmails when event state is invited', async () => {
    const event = makeEvent({ state: 'invited' })
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    await action({
      eventGroups: [makeParticipantGroupInfo('reg1')],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendPickedEmails).toHaveBeenCalled()
    expect(notifier.sendInvitedEmails).toHaveBeenCalled()
  })

  it('does not call notifier.sendInvitedEmails when event state is picked (not invited)', async () => {
    const event = makeEvent({ state: 'picked' })
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    await action({
      eventGroups: [makeParticipantGroupInfo('reg1')],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendPickedEmails).toHaveBeenCalled()
    expect(notifier.sendInvitedEmails).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

describe('createApplyGroupChanges – cancellation', () => {
  it('calls notifier.sendCancelledEmails for registrations moved to cancelled group', async () => {
    const event = makeEvent()
    // Old registration in a participant group (not cancelled)
    const reg = makeRegistration({
      cancelled: false,
      group: { date: '2030-06-01', key: '2030-06-01-ap', number: 1, time: 'ap' },
      id: 'reg1',
    })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    // Move reg to cancelled group
    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'cancelled', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendCancelledEmails).toHaveBeenCalled()
  })

  it('result cancelledItems contains newly cancelled registrations', async () => {
    const event = makeEvent()
    const reg = makeRegistration({
      cancelled: false,
      group: { date: '2030-06-01', key: '2030-06-01-ap', number: 1, time: 'ap' },
      id: 'reg1',
    })
    const action = createApplyGroupChanges({
      notifier: makeNotifier(),
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'cancelled', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(result.cancelledItems).toHaveLength(1)
    expect(result.cancelledItems[0].id).toBe('reg1')
  })

  it('does not include already-cancelled registrations in cancelledItems', async () => {
    const event = makeEvent()
    // Reg was already cancelled before this action
    const reg = makeRegistration({
      cancelled: true,
      group: { key: 'cancelled', number: 1 },
      id: 'reg1',
    })
    const action = createApplyGroupChanges({
      notifier: makeNotifier(),
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'cancelled', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    // Already was cancelled, so not in cancelledItems
    expect(result.cancelledItems).toHaveLength(0)
  })

  it('always calls notifier.sendCancelledEmails (even with empty cancelled list)', async () => {
    const event = makeEvent()
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendCancelledEmails).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Reserve moved up
// ---------------------------------------------------------------------------

describe('createApplyGroupChanges – reserve moved up', () => {
  it('calls notifier.sendReserveEmails for reserveNotified registrations moved to lower number in reserve', async () => {
    const event = makeEvent({ state: 'picked' })
    // Reg is in reserve at position 5, with reserveNotified=true
    const reg = makeRegistration({
      group: { key: 'reserve', number: 5 },
      id: 'reg1',
      reserveNotified: true,
    })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    // fixRegistrationGroups mock will return the reg with updated (lower) reserve number
    mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) =>
      regs.map((r) => (r.id === 'reg1' ? { ...r, group: { key: 'reserve', number: 2 } } : r))
    )

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 5 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendReserveEmails).toHaveBeenCalled()
  })

  it('calls notifier.updateReserveNotified for moved reserve registrations', async () => {
    const event = makeEvent({ state: 'picked' })
    const reg = makeRegistration({
      group: { key: 'reserve', number: 5 },
      id: 'reg1',
      reserveNotified: true,
    })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) =>
      regs.map((r) => (r.id === 'reg1' ? { ...r, group: { key: 'reserve', number: 2 } } : r))
    )

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 5 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.updateReserveNotified).toHaveBeenCalled()
  })

  it('does not call notifier.sendReserveEmails when event state is confirmed', async () => {
    const event = makeEvent({ state: 'confirmed' })
    const reg = makeRegistration({
      group: { key: 'reserve', number: 5 },
      id: 'reg1',
      reserveNotified: true,
    })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) =>
      regs.map((r) => (r.id === 'reg1' ? { ...r, group: { key: 'reserve', number: 2 } } : r))
    )

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 5 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(notifier.sendReserveEmails).not.toHaveBeenCalled()
    expect(notifier.updateReserveNotified).not.toHaveBeenCalled()
  })

  it('calls sendReserveEmails with empty array when reserveNotified is undefined', async () => {
    const event = makeEvent({ state: 'picked' })
    const reg = makeRegistration({
      group: { key: 'reserve', number: 5 },
      id: 'reg1',
      reserveNotified: undefined,
    })
    const notifier = makeNotifier()
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    mockFixRegistrationGroups.mockImplementation(async (regs: JsonRegistration[]) =>
      regs.map((r) => (r.id === 'reg1' ? { ...r, group: { key: 'reserve', number: 2 } } : r))
    )

    await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 5 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    // sendReserveEmails is always called inside the picked/invited block,
    // but with an empty movedReserve array (since reserveNotified is falsy)
    expect(notifier.sendReserveEmails).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.any(String),
      expect.any(String)
    )
  })
})

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('createApplyGroupChanges – result emails shape', () => {
  it('returns emails object with all ok/failed fields', async () => {
    const event = makeEvent()
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    ;(
      notifier.sendCancelledEmails as jest.MockedFunction<GroupChangeNotifier['sendCancelledEmails']>
    ).mockResolvedValue({
      failed: ['fail@example.com'],
      ok: ['ok@example.com'],
    })
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(result.emails).toMatchObject({
      cancelledFailed: expect.any(Array),
      cancelledOk: expect.any(Array),
      invitedFailed: expect.any(Array),
      invitedOk: expect.any(Array),
      pickedFailed: expect.any(Array),
      pickedOk: expect.any(Array),
      reserveFailed: expect.any(Array),
      reserveOk: expect.any(Array),
    })
  })

  it('email results from notifier are surfaced in result', async () => {
    const event = makeEvent()
    const reg = makeRegistration({ group: { key: 'reserve', number: 1 }, id: 'reg1' })
    const notifier = makeNotifier()
    ;(
      notifier.sendCancelledEmails as jest.MockedFunction<GroupChangeNotifier['sendCancelledEmails']>
    ).mockResolvedValue({
      failed: ['a@b.com'],
      ok: ['x@y.com'],
    })
    const action = createApplyGroupChanges({
      notifier,
      repo: makeRepo({
        listReadyByEventId: jest.fn(async () => [reg]) as unknown as RegistrationRepository['listReadyByEventId'],
      }),
      sync: makeSync(event),
    })

    const result = await action({
      eventGroups: [makeGroupInfo('reg1', { key: 'reserve', number: 1 })],
      eventId: 'event123',
      origin: 'https://example.com',
      user: makeUser(),
    })

    expect(result.emails.cancelledOk).toEqual(['x@y.com'])
    expect(result.emails.cancelledFailed).toEqual(['a@b.com'])
  })
})
