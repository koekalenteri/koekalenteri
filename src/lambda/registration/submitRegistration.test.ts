import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { EventReadPort, RegistrationStatsPort, SyncAggregatesPort } from './api'
import type { RegistrationRepository } from './repository'
import { jest } from '@jest/globals'
import { createSubmitRegistration } from './actions'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent =>
  ({
    classes: [{ class: 'ALO', date: '2030-06-01', entries: 0, members: 0, time: '09:00' }],
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
    handler: { email: 'handler@example.com', name: 'Handler' },
    id: 'reg456',
    language: 'fi',
    modifiedAt: '2025-04-01T10:00:00.000Z',
    modifiedBy: 'user1',
    owner: { email: 'owner@example.com', name: 'Owner' },
    payer: { email: 'payer@example.com', name: 'Payer' },
    state: 'creating',
    ...overrides,
  }) as unknown as JsonRegistration

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

const makeEventRead = (event: JsonConfirmedEvent = makeEvent()): EventReadPort => ({
  getConfirmedEvent: jest.fn(async () => event) as unknown as EventReadPort['getConfirmedEvent'],
})

const makeSyncPort = (event: JsonConfirmedEvent = makeEvent()): SyncAggregatesPort => ({
  syncEventAggregates: jest.fn(async () => ({
    changed: true,
    event,
  })) as unknown as SyncAggregatesPort['syncEventAggregates'],
})

const makeStatsPort = (): RegistrationStatsPort => ({
  recordRegistrationChange: jest.fn(
    async () => undefined
  ) as unknown as RegistrationStatsPort['recordRegistrationChange'],
})

const timestamp = '2025-04-15T10:00:00.000Z'
const username = 'testuser'

// ---------------------------------------------------------------------------
// create flow
// ---------------------------------------------------------------------------

describe('createSubmitRegistration – create flow', () => {
  it('returns kind: created with repo.create called for new registration', async () => {
    const event = makeEvent()
    const repo = makeRepo({
      listByEventId: jest.fn(async () => []) as unknown as RegistrationRepository['listByEventId'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input: JsonRegistration = makeRegistration({ id: undefined as unknown as string })

    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('created')
    expect(repo.create).toHaveBeenCalledTimes(1)
  })

  it('assigns id, createdAt, createdBy, modifiedAt, modifiedBy', async () => {
    const event = makeEvent()
    const repo = makeRepo()
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input: JsonRegistration = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'created') throw new Error('expected created')

    expect(result.registration.createdAt).toBe(timestamp)
    expect(result.registration.createdBy).toBe(username)
    expect(result.registration.modifiedAt).toBe(timestamp)
    expect(result.registration.modifiedBy).toBe(username)
    expect(result.registration.id).toBeTruthy()
  })

  it('sets state to creating when paymentTime is registration', async () => {
    const event = makeEvent({ paymentTime: 'registration' })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo: makeRepo(),
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'created') throw new Error('expected created')
    expect(result.registration.state).toBe('creating')
  })

  it('sets state to ready when paymentTime is confirmation', async () => {
    const event = makeEvent({ paymentTime: 'confirmation' })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo: makeRepo(),
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'created') throw new Error('expected created')
    expect(result.registration.state).toBe('ready')
  })

  it('strips paidAmount, paidAt, paymentStatus from the input', async () => {
    const event = makeEvent()
    const mockCreate = jest.fn(async () => undefined)
    const repo = makeRepo({ create: mockCreate as unknown as RegistrationRepository['create'] })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({
      id: undefined as unknown as string,
      paidAmount: 99,
      paidAt: '2025-01-01T00:00:00.000Z',
      paymentStatus: 'SUCCESS' as JsonRegistration['paymentStatus'],
    })
    await action({ registration: input, timestamp, username })

    const saved = (mockCreate as jest.MockedFunction<RegistrationRepository['create']>).mock.calls[0][0]
    expect(saved.paidAmount).toBeUndefined()
    expect(saved.paidAt).toBeUndefined()
    expect(saved.paymentStatus).toBeUndefined()
  })

  it('calls syncEventAggregates and recordRegistrationChange after create', async () => {
    const event = makeEvent()
    const syncPort = makeSyncPort(event)
    const statsPort = makeStatsPort()
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo: makeRepo(),
      stats: statsPort,
      sync: syncPort,
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    await action({ registration: input, timestamp, username })

    expect(syncPort.syncEventAggregates).toHaveBeenCalledWith('event123')
    expect(statsPort.recordRegistrationChange).toHaveBeenCalledTimes(1)
  })

  it('returns kind: entry-closed when entry period is not open', async () => {
    const event = makeEvent({ entryEndDate: '2020-01-01', entryStartDate: '2019-12-01' })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo: makeRepo(),
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('entry-closed')
  })

  it('returns kind: already-registered when dog has a ready non-cancelled registration', async () => {
    const event = makeEvent()
    const existingReg = makeRegistration({
      cancelled: false,
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      state: 'ready',
    })
    const repo = makeRepo({
      listByEventId: jest.fn(async () => [existingReg]) as unknown as RegistrationRepository['listByEventId'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: undefined as unknown as string,
    })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('already-registered')
    if (result.kind === 'already-registered') {
      expect(result.cancelled).toBe(false)
    }
  })

  it('does not flag already-registered for cancelled existing registration', async () => {
    const event = makeEvent()
    const existingReg = makeRegistration({
      cancelled: true,
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      state: 'ready',
    })
    const repo = makeRepo({
      listByEventId: jest.fn(async () => [existingReg]) as unknown as RegistrationRepository['listByEventId'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: undefined as unknown as string,
    })
    const result = await action({ registration: input, timestamp, username })

    // A cancelled registration does not block a new one
    expect(result.kind).not.toBe('already-registered')
  })
})

// ---------------------------------------------------------------------------
// update flow
// ---------------------------------------------------------------------------

describe('createSubmitRegistration – update flow', () => {
  it('returns kind: updated with repo.patch called when registration changed', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ notes: 'updated note' })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('updated')
    expect(repo.patch).toHaveBeenCalledTimes(1)
  })

  it('returns kind: no-op when no meaningful fields changed', async () => {
    const event = makeEvent()
    const existing = makeRegistration()
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    // Same data as existing (modifiedAt/By differences are stripped from comparison)
    const input = makeRegistration()
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('no-op')
    expect(repo.patch).not.toHaveBeenCalled()
  })

  it('returns classification: cancelled for cancel transitions', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ cancelled: false })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ cancelled: true })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('updated')
    if (result.kind === 'updated') {
      expect(result.classification).toBe('cancelled')
    }
  })

  it('returns classification: confirmed for confirmation transitions', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ confirmed: false })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ confirmed: true })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('updated')
    if (result.kind === 'updated') {
      expect(result.classification).toBe('confirmed')
    }
  })

  it('returns classification: invitation-read for invitation read transitions', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ invitationRead: undefined })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ invitationRead: true as unknown as JsonRegistration['invitationRead'] })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('updated')
    if (result.kind === 'updated') {
      expect(result.classification).toBe('invitation-read')
    }
  })

  it('returns existing snapshot in the result for audit/email context', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ notes: 'new note' })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'updated') throw new Error('expected updated')
    expect(result.existing).toBe(existing)
  })

  it('syncs aggregates and records stats after cancel', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ cancelled: false })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const syncPort = makeSyncPort(event)
    const statsPort = makeStatsPort()
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: statsPort,
      sync: syncPort,
    })

    const input = makeRegistration({ cancelled: true })
    await action({ registration: input, timestamp, username })

    expect(syncPort.syncEventAggregates).toHaveBeenCalledWith('event123')
    expect(statsPort.recordRegistrationChange).toHaveBeenCalledTimes(1)
  })

  it('does not sync aggregates for a plain field update', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const syncPort = makeSyncPort(event)
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: makeStatsPort(),
      sync: syncPort,
    })

    const input = makeRegistration({ notes: 'new note' })
    await action({ registration: input, timestamp, username })

    expect(syncPort.syncEventAggregates).not.toHaveBeenCalled()
  })

  it('stats receives the updated event from sync when sync runs', async () => {
    const event = makeEvent()
    const syncedEvent = makeEvent({ entries: 5 })
    const existing = makeRegistration({ cancelled: false })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const syncPort: SyncAggregatesPort = {
      syncEventAggregates: jest.fn(async () => ({
        changed: true,
        event: syncedEvent,
      })) as unknown as SyncAggregatesPort['syncEventAggregates'],
    }
    const statsPort = makeStatsPort()
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: statsPort,
      sync: syncPort,
    })

    const input = makeRegistration({ cancelled: true })
    await action({ registration: input, timestamp, username })

    const statsCall = (
      statsPort.recordRegistrationChange as jest.MockedFunction<RegistrationStatsPort['recordRegistrationChange']>
    ).mock.calls[0][0]
    expect(statsCall.event.entries).toBe(5)
  })

  it('records stats with previous registration snapshot', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const statsPort = makeStatsPort()
    const action = createSubmitRegistration({
      eventRead: makeEventRead(event),
      repo,
      stats: statsPort,
      sync: makeSyncPort(event),
    })

    const input = makeRegistration({ notes: 'new' })
    await action({ registration: input, timestamp, username })

    const statsCall = (
      statsPort.recordRegistrationChange as jest.MockedFunction<RegistrationStatsPort['recordRegistrationChange']>
    ).mock.calls[0][0]
    expect(statsCall.previous).toBe(existing)
  })
})
