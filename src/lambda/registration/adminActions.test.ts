import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { RegistrationStatsPort, SyncAggregatesPort } from './api'
import type { RegistrationRepository } from './repository'
import { jest } from '@jest/globals'
import { createSaveAdminRegistration, createUpdateRegistrationNotes } from './actions'

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
    state: 'ready',
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

const makeSync = (event: JsonConfirmedEvent = makeEvent()): SyncAggregatesPort => ({
  syncEventAggregates: jest.fn(async () => ({
    changed: true,
    event,
  })) as unknown as SyncAggregatesPort['syncEventAggregates'],
})

const makeStats = (): RegistrationStatsPort => ({
  recordRegistrationChange: jest.fn(
    async () => undefined
  ) as unknown as RegistrationStatsPort['recordRegistrationChange'],
})

const makeFixGroups = () => ({
  fixRegistrationGroups: jest.fn(async (regs: JsonRegistration[]) => regs),
})

const timestamp = '2025-04-15T10:00:00.000Z'
const username = 'adminuser'

// ---------------------------------------------------------------------------
// createSaveAdminRegistration
// ---------------------------------------------------------------------------

describe('createSaveAdminRegistration – create path', () => {
  it('calls repo.create and returns kind: saved when registration has no id', async () => {
    const event = makeEvent()
    const repo = makeRepo()
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo,
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('saved')
    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(repo.patch).not.toHaveBeenCalled()
  })

  it('assigns id, createdAt, createdBy, state=ready for new registrations', async () => {
    const event = makeEvent()
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo: makeRepo(),
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'saved') throw new Error('expected saved')
    expect(result.data.id).toBeTruthy()
    expect(result.data.createdAt).toBe(timestamp)
    expect(result.data.createdBy).toBe(username)
    expect(result.data.modifiedAt).toBe(timestamp)
    expect(result.data.modifiedBy).toBe(username)
    expect(result.data.state).toBe('ready')
  })

  it('calls syncEventAggregates after create', async () => {
    const event = makeEvent()
    const syncPort = makeSync(event)
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo: makeRepo(),
      stats: makeStats(),
      sync: syncPort,
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    await action({ registration: input, timestamp, username })

    expect(syncPort.syncEventAggregates).toHaveBeenCalledWith('event123')
  })

  it('calls fixGroups.fixRegistrationGroups after create', async () => {
    const event = makeEvent()
    const fixGroups = makeFixGroups()
    const action = createSaveAdminRegistration({
      fixGroups,
      repo: makeRepo(),
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    await action({ registration: input, timestamp, username })

    expect(fixGroups.fixRegistrationGroups).toHaveBeenCalledTimes(1)
  })

  it('calls stats.recordRegistrationChange after create', async () => {
    const event = makeEvent()
    const statsPort = makeStats()
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo: makeRepo(),
      stats: statsPort,
      sync: makeSync(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    await action({ registration: input, timestamp, username })

    expect(statsPort.recordRegistrationChange).toHaveBeenCalledTimes(1)
  })

  it('result data comes from fixGroups result (registration found by id)', async () => {
    const event = makeEvent()

    // Capture the created registration so listReadyByEventId can return it.
    // The action calls listReadyByEventId AFTER repo.create, so the closure works.
    let capturedReg: JsonRegistration | undefined
    const repo = makeRepo({
      create: jest.fn(async (reg: JsonRegistration) => {
        capturedReg = reg
      }) as unknown as RegistrationRepository['create'],
      listReadyByEventId: jest.fn(async () =>
        capturedReg ? [capturedReg] : []
      ) as unknown as RegistrationRepository['listReadyByEventId'],
    })

    const fixGroups = {
      fixRegistrationGroups: jest.fn(async (regs: JsonRegistration[]) =>
        regs.map((r) => ({ ...r, group: { key: 'ALO', number: 1 } }))
      ),
    }

    const action = createSaveAdminRegistration({
      fixGroups,
      repo,
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ id: undefined as unknown as string })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'saved') throw new Error('expected saved')
    expect(result.data.group).toEqual({ key: 'ALO', number: 1 })
    expect(capturedReg?.id).toBe(result.data.id)
  })
})

describe('createSaveAdminRegistration – duplicate guard', () => {
  it('returns kind: already-registered when same dog.regNo has ready non-cancelled registration', async () => {
    const event = makeEvent()
    const existingReg = makeRegistration({
      cancelled: false,
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: 'other-reg',
      state: 'ready',
    })
    const repo = makeRepo({
      listByEventId: jest.fn(async () => [existingReg]) as unknown as RegistrationRepository['listByEventId'],
    })
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo,
      stats: makeStats(),
      sync: makeSync(event),
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

  it('returns cancelled: false when the found duplicate is not cancelled', async () => {
    const event = makeEvent()
    const existingReg = makeRegistration({
      cancelled: false,
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: 'other-reg',
      state: 'ready',
    })
    const repo = makeRepo({
      listByEventId: jest.fn(async () => [existingReg]) as unknown as RegistrationRepository['listByEventId'],
    })
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo,
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: undefined as unknown as string,
    })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind === 'already-registered') {
      expect(result.cancelled).toBe(false)
    } else {
      throw new Error('expected already-registered')
    }
  })

  it('does not block when existing registration is cancelled', async () => {
    const event = makeEvent()
    const cancelledReg = makeRegistration({
      cancelled: true,
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: 'other-reg',
      state: 'ready',
    })
    const repo = makeRepo({
      listByEventId: jest.fn(async () => [cancelledReg]) as unknown as RegistrationRepository['listByEventId'],
    })
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo,
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({
      dog: { breedCode: '110', name: 'Rex', regNo: 'FI12345/20' },
      id: undefined as unknown as string,
    })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).not.toBe('already-registered')
  })
})

describe('createSaveAdminRegistration – update path', () => {
  it('calls repo.patch (not repo.create) when registration.id is set and existing is found', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo,
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ notes: 'new note' })
    const result = await action({ registration: input, timestamp, username })

    expect(result.kind).toBe('saved')
    expect(repo.patch).toHaveBeenCalledTimes(1)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('calls syncEventAggregates after update', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const syncPort = makeSync(event)
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo: makeRepo({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      }),
      stats: makeStats(),
      sync: syncPort,
    })

    const input = makeRegistration({ notes: 'new note' })
    await action({ registration: input, timestamp, username })

    expect(syncPort.syncEventAggregates).toHaveBeenCalledWith('event123')
  })

  it('calls fixGroups.fixRegistrationGroups after update', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const fixGroups = makeFixGroups()
    const action = createSaveAdminRegistration({
      fixGroups,
      repo: makeRepo({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      }),
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ notes: 'new note' })
    await action({ registration: input, timestamp, username })

    expect(fixGroups.fixRegistrationGroups).toHaveBeenCalledTimes(1)
  })

  it('calls stats.recordRegistrationChange with previous after update', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const statsPort = makeStats()
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo: makeRepo({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      }),
      stats: statsPort,
      sync: makeSync(event),
    })

    const input = makeRegistration({ notes: 'new note' })
    await action({ registration: input, timestamp, username })

    const call = (
      statsPort.recordRegistrationChange as jest.MockedFunction<RegistrationStatsPort['recordRegistrationChange']>
    ).mock.calls[0][0]
    expect(call.previous).toBe(existing)
  })

  it('result existing is the pre-update snapshot', async () => {
    const event = makeEvent()
    const existing = makeRegistration({ notes: 'old note' })
    const action = createSaveAdminRegistration({
      fixGroups: makeFixGroups(),
      repo: makeRepo({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      }),
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ notes: 'new note' })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'saved') throw new Error('expected saved')
    expect(result.existing).toBe(existing)
  })

  it('result data comes from fixGroups result (registration found by id)', async () => {
    const event = makeEvent()
    const existing = makeRegistration()
    const updatedReg = makeRegistration({ group: { key: 'ALO', number: 2 } })
    const fixGroups = {
      fixRegistrationGroups: jest.fn(async (_regs: JsonRegistration[]) => [updatedReg]),
    }
    const action = createSaveAdminRegistration({
      fixGroups,
      repo: makeRepo({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      }),
      stats: makeStats(),
      sync: makeSync(event),
    })

    const input = makeRegistration({ notes: 'updated' })
    const result = await action({ registration: input, timestamp, username })

    if (result.kind !== 'saved') throw new Error('expected saved')
    expect(result.data.group).toEqual({ key: 'ALO', number: 2 })
  })
})

// ---------------------------------------------------------------------------
// createUpdateRegistrationNotes
// ---------------------------------------------------------------------------

describe('createUpdateRegistrationNotes', () => {
  it('calls repo.patch with set: { internalNotes } when internalNotes is a string', async () => {
    const existing = makeRegistration()
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createUpdateRegistrationNotes(repo)

    await action({ eventId: 'event123', internalNotes: 'some notes', registrationId: 'reg456' })

    expect(repo.patch).toHaveBeenCalledWith('event123', 'reg456', {
      set: { internalNotes: 'some notes' },
    })
  })

  it('returns updated registration with the new internalNotes', async () => {
    const existing = makeRegistration()
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createUpdateRegistrationNotes(repo)

    const result = await action({ eventId: 'event123', internalNotes: 'some notes', registrationId: 'reg456' })

    expect(result.registration.internalNotes).toBe('some notes')
  })

  it('calls repo.patch with remove: [internalNotes] when internalNotes is undefined', async () => {
    const existing = makeRegistration({ internalNotes: 'old notes' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createUpdateRegistrationNotes(repo)

    await action({ eventId: 'event123', internalNotes: undefined, registrationId: 'reg456' })

    expect(repo.patch).toHaveBeenCalledWith('event123', 'reg456', {
      remove: ['internalNotes'],
    })
  })

  it('returns registration without internalNotes when internalNotes is undefined', async () => {
    const existing = makeRegistration({ internalNotes: 'old notes' })
    const repo = makeRepo({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
    })
    const action = createUpdateRegistrationNotes(repo)

    const result = await action({ eventId: 'event123', internalNotes: undefined, registrationId: 'reg456' })

    expect(result.registration.internalNotes).toBeUndefined()
  })

  it('throws an error when registration is not found', async () => {
    const repo = makeRepo({
      getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
    })
    const action = createUpdateRegistrationNotes(repo)

    await expect(action({ eventId: 'event123', internalNotes: 'notes', registrationId: 'reg456' })).rejects.toThrow(
      "Registration 'reg456' for event 'event123' was not found"
    )
  })

  it('does not call repo.patch when registration is not found', async () => {
    const repo = makeRepo({
      getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
    })
    const action = createUpdateRegistrationNotes(repo)

    await expect(action({ eventId: 'event123', internalNotes: 'notes', registrationId: 'reg456' })).rejects.toThrow()

    expect(repo.patch).not.toHaveBeenCalled()
  })
})
