import type { JsonEventClass, JsonRegistration, JsonUser } from '../../types'
import type { EventPublisher, PublishEventChangeInput } from './api'
import type { EventAggregatePatch, EventPatch, EventRepository } from './repository'
import { jest } from '@jest/globals'
import { createSaveEvent, createSyncEventAggregates } from './actions'
import { createEvent } from './testUtils'

// Minimal registration helper reused in aggregate sync tests
const createReg = (overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    cancelled: false,
    class: 'ALO',
    eventId: 'event123',
    id: 'reg1',
    state: 'ready',
    ...overrides,
  }) as unknown as JsonRegistration

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const mockAdmin: JsonUser = {
  admin: true,
  createdAt: '',
  createdBy: 'test',
  email: 'admin@example.com',
  id: 'admin-1',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Admin User',
}

const mockSecretary: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'secretary@example.com',
  id: 'secretary-1',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Secretary User',
  roles: { org123: 'secretary' },
}

const timestamp = '2025-01-15T10:00:00.000Z'

// ---------------------------------------------------------------------------
// Collaborator factories
// ---------------------------------------------------------------------------

const makeRepository = (overrides: Partial<EventRepository> = {}): EventRepository => ({
  create: jest.fn(async (input) => input) as unknown as EventRepository['create'],
  findQualificationStartDate: jest.fn(
    async () => undefined
  ) as unknown as EventRepository['findQualificationStartDate'],
  getById: jest.fn(async () => undefined) as unknown as EventRepository['getById'],
  listAll: jest.fn(async () => []) as unknown as EventRepository['listAll'],
  listAllConfirmed: jest.fn(async () => []) as unknown as EventRepository['listAllConfirmed'],
  listAllRegistrations: jest.fn(async () => []) as unknown as EventRepository['listAllRegistrations'],
  listBySeasonModifiedAfter: jest.fn(async () => []) as unknown as EventRepository['listBySeasonModifiedAfter'],
  listBySeasonStartDateRange: jest.fn(async () => []) as unknown as EventRepository['listBySeasonStartDateRange'],
  patch: jest.fn(async (p: EventPatch) => createEvent({ id: p.eventId })) as unknown as EventRepository['patch'],
  patchAggregates: jest.fn(async (p: EventAggregatePatch) =>
    createEvent({ id: p.eventId })
  ) as unknown as EventRepository['patchAggregates'],
  save: jest.fn(async () => undefined) as unknown as EventRepository['save'],
  updateInvitationAttachment: jest.fn(
    async () => undefined
  ) as unknown as EventRepository['updateInvitationAttachment'],
  ...overrides,
})

const makePublisher = (overrides: Partial<EventPublisher> = {}): EventPublisher => ({
  publishChange: jest.fn(async () => undefined) as unknown as EventPublisher['publishChange'],
  publishRegistrationPatches: jest.fn(async () => undefined) as unknown as EventPublisher['publishRegistrationPatches'],
  ...overrides,
})

const makeFindQualificationStartDate = (result: string | undefined = undefined) =>
  jest.fn<() => Promise<string | undefined>>(async () => result)

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------

describe('createSaveEvent – create flow', () => {
  it('calls repository.create and returns created: true for a new event', async () => {
    const repository = makeRepository()
    const publisher = makePublisher()
    const findQualificationStartDate = makeFindQualificationStartDate()
    const saveEvent = createSaveEvent({ findQualificationStartDate, publisher, repository })

    const result = await saveEvent({
      item: { eventType: 'NOU', organizer: { id: 'org123', name: 'Test Org' } },
      timestamp,
      user: mockAdmin,
    })

    expect(result.created).toBe(true)
    expect(repository.create).toHaveBeenCalledTimes(1)
    expect(repository.patch).not.toHaveBeenCalled()
    expect(result.event.createdAt).toBe(timestamp)
    expect(result.event.createdBy).toBe(mockAdmin.name)
    expect(result.event.modifiedAt).toBe(timestamp)
    expect(result.event.modifiedBy).toBe(mockAdmin.name)
    expect(typeof result.event.id).toBe('string')
    expect(result.event.id.length).toBeGreaterThan(0)
  })

  it('does not call publisher.publishChange on create', async () => {
    const repository = makeRepository()
    const publisher = makePublisher()
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher,
      repository,
    })

    await saveEvent({ item: {}, timestamp, user: mockAdmin })

    expect(publisher.publishChange).not.toHaveBeenCalled()
  })

  it('resolves qualificationStartDate for NOME-B SM events without one', async () => {
    const qualDate = '2024-10-01T00:00:00.000Z'
    const repository = makeRepository()
    const publisher = makePublisher()
    const findQualificationStartDate = makeFindQualificationStartDate(qualDate)
    const saveEvent = createSaveEvent({ findQualificationStartDate, publisher, repository })

    const result = await saveEvent({
      item: { entryEndDate: '2025-01-20', eventType: 'NOME-B SM' },
      timestamp,
      user: mockAdmin,
    })

    expect(findQualificationStartDate).toHaveBeenCalledWith('NOME-B SM', '2025-01-20')
    expect(result.event.qualificationStartDate).toBe(qualDate)
  })

  it('skips qualification date lookup for NOME-B SM when already set', async () => {
    const repository = makeRepository()
    const publisher = makePublisher()
    const findQualificationStartDate = makeFindQualificationStartDate('should-not-be-used')
    const saveEvent = createSaveEvent({ findQualificationStartDate, publisher, repository })

    await saveEvent({
      item: { entryEndDate: '2025-01-20', eventType: 'NOME-B SM', qualificationStartDate: '2024-06-01' },
      timestamp,
      user: mockAdmin,
    })

    expect(findQualificationStartDate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Update flow
// ---------------------------------------------------------------------------

describe('createSaveEvent – update flow', () => {
  it('calls repository.patch with the computed patch for changed fields', async () => {
    const existing = createEvent({ name: 'Old Name', places: 10 })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
      patch: jest.fn(async () =>
        createEvent({ ...existing, name: 'New Name', places: 15 })
      ) as unknown as EventRepository['patch'],
    })
    const publisher = makePublisher()
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher,
      repository,
    })

    const result = await saveEvent({
      item: { id: existing.id, name: 'New Name', places: 15 },
      timestamp,
      user: mockAdmin,
    })

    expect(result.created).toBe(false)
    expect(repository.patch).toHaveBeenCalledTimes(1)
    expect(repository.create).not.toHaveBeenCalled()

    const patchArg = (repository.patch as ReturnType<typeof jest.fn>).mock.calls[0]?.[0] as EventPatch
    expect(patchArg.eventId).toBe(existing.id)
    expect(patchArg.set).toMatchObject({ name: 'New Name', places: 15 })
  })

  it('sets modifiedAt and modifiedBy on update', async () => {
    const existing = createEvent({ name: 'Old Name' })
    const patchedEvent = createEvent({
      ...existing,
      modifiedAt: timestamp,
      modifiedBy: mockSecretary.name,
      name: 'New Name',
    })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
      patch: jest.fn(async () => patchedEvent) as unknown as EventRepository['patch'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    await saveEvent({ item: { id: existing.id, name: 'New Name' }, timestamp, user: mockSecretary })

    const patchArg = (repository.patch as ReturnType<typeof jest.fn>).mock.calls[0]?.[0] as EventPatch
    expect(patchArg.set?.modifiedAt).toBe(timestamp)
    expect(patchArg.set?.modifiedBy).toBe(mockSecretary.name)
  })

  it('calls publisher.publishChange after a successful patch', async () => {
    const existing = createEvent({ name: 'Old Name' })
    const updated = createEvent({ ...existing, name: 'New Name' })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
      patch: jest.fn(async () => updated) as unknown as EventRepository['patch'],
    })
    const publisher = makePublisher()
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher,
      repository,
    })

    await saveEvent({ item: { id: existing.id, name: 'New Name' }, timestamp, user: mockAdmin })

    expect(publisher.publishChange).toHaveBeenCalledTimes(1)
    const publishArg = (publisher.publishChange as ReturnType<typeof jest.fn>).mock
      .calls[0]?.[0] as PublishEventChangeInput
    expect(publishArg.organizerId).toBe(updated.organizer.id)
    expect(publishArg.payload.eventId).toBe(updated.id)
  })

  it('does not call publisher.publishChange when patch has no effective changes', async () => {
    const existing = createEvent({ modifiedAt: timestamp, modifiedBy: mockAdmin.name, name: 'Same Name' })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
    })
    const publisher = makePublisher()
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher,
      repository,
    })

    const result = await saveEvent({ item: { id: existing.id, name: existing.name }, timestamp, user: mockAdmin })

    expect(repository.patch).not.toHaveBeenCalled()
    expect(publisher.publishChange).not.toHaveBeenCalled()
    expect(result.event).toEqual(existing)
  })

  it('resolves qualificationStartDate for NOME-B SM updates without one', async () => {
    const qualDate = '2024-10-01T00:00:00.000Z'
    const existing = createEvent({ eventType: 'NOME-B SM', qualificationStartDate: undefined })
    const patchedEvent = createEvent({ ...existing, qualificationStartDate: qualDate })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
      patch: jest.fn(async () => patchedEvent) as unknown as EventRepository['patch'],
    })
    const findQualificationStartDate = makeFindQualificationStartDate(qualDate)
    const saveEvent = createSaveEvent({ findQualificationStartDate, publisher: makePublisher(), repository })

    const result = await saveEvent({
      item: { entryEndDate: existing.entryEndDate, eventType: 'NOME-B SM', id: existing.id },
      timestamp,
      user: mockAdmin,
    })

    expect(findQualificationStartDate).toHaveBeenCalled()
    expect(result.event.qualificationStartDate).toBe(qualDate)
  })

  it('returns result with updated event and aggregateSyncTriggered: false for non-aggregate field changes', async () => {
    const existing = createEvent({ name: 'Old Name' })
    const updated = createEvent({ ...existing, name: 'Updated Name' })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
      patch: jest.fn(async () => updated) as unknown as EventRepository['patch'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    const result = await saveEvent({ item: { id: existing.id, name: 'Updated Name' }, timestamp, user: mockAdmin })

    expect(result.event).toEqual(updated)
    expect(result.aggregateSyncTriggered).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// No-op update flow
// ---------------------------------------------------------------------------

describe('createSaveEvent – no-op update flow', () => {
  // The action always injects modifiedAt/modifiedBy into intended, so for a true
  // no-op the existing event must already carry the same timestamp and actor.
  it('returns created: false without calling patch when no fields changed', async () => {
    const existing = createEvent({ modifiedAt: timestamp, modifiedBy: mockAdmin.name })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
    })
    const publisher = makePublisher()
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher,
      repository,
    })

    const result = await saveEvent({
      item: { id: existing.id, name: existing.name, places: existing.places },
      timestamp,
      user: mockAdmin,
    })

    expect(result.created).toBe(false)
    expect(result.event).toEqual(existing)
    expect(repository.patch).not.toHaveBeenCalled()
    expect(publisher.publishChange).not.toHaveBeenCalled()
  })

  it('returns aggregateSyncTriggered: false on no-op', async () => {
    const existing = createEvent({ modifiedAt: timestamp, modifiedBy: mockAdmin.name })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    const result = await saveEvent({
      item: { id: existing.id, name: existing.name },
      timestamp,
      user: mockAdmin,
    })

    expect(result.created).toBe(false)
    expect(result.aggregateSyncTriggered).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Guard behavior
// ---------------------------------------------------------------------------

describe('createSaveEvent – guard behavior', () => {
  it('throws Forbidden when a non-admin user lacks a role for the existing organizer', async () => {
    const existing = createEvent({ organizer: { id: 'other-org', name: 'Other Org' } })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    await expect(
      saveEvent({ item: { id: existing.id, name: 'New Name' }, timestamp, user: mockSecretary })
    ).rejects.toThrow('Forbidden')

    expect(repository.patch).not.toHaveBeenCalled()
  })

  it('throws Forbidden when a non-admin user lacks a role for the incoming organizer', async () => {
    const repository = makeRepository({
      getById: jest.fn(async () => undefined) as unknown as EventRepository['getById'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    await expect(
      saveEvent({
        item: { organizer: { id: 'other-org', name: 'Other Org' } },
        timestamp,
        user: mockSecretary,
      })
    ).rejects.toThrow('Forbidden')

    expect(repository.create).not.toHaveBeenCalled()
  })

  it('admin can write events belonging to any organizer', async () => {
    const existing = createEvent({ organizer: { id: 'other-org', name: 'Other Org' } })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
      patch: jest.fn(async () =>
        createEvent({ ...existing, name: 'Admin Update' })
      ) as unknown as EventRepository['patch'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    const result = await saveEvent({ item: { id: existing.id, name: 'Admin Update' }, timestamp, user: mockAdmin })

    expect(result.event.name).toBe('Admin Update')
    expect(repository.patch).toHaveBeenCalledTimes(1)
  })

  it('throws Forbidden when attempting to delete a non-deletable event', async () => {
    // A confirmed event with entries cannot be soft-deleted
    const existing = createEvent({ entries: 5, state: 'confirmed' })
    const repository = makeRepository({
      getById: jest.fn(async () => existing) as unknown as EventRepository['getById'],
    })
    const saveEvent = createSaveEvent({
      findQualificationStartDate: makeFindQualificationStartDate(),
      publisher: makePublisher(),
      repository,
    })

    await expect(
      saveEvent({
        item: { deletedAt: new Date().toISOString(), id: existing.id },
        timestamp,
        user: mockAdmin,
      })
    ).rejects.toThrow('Forbidden')

    expect(repository.patch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// createSyncEventAggregates tests  (Step 12)
// ---------------------------------------------------------------------------

describe('createSyncEventAggregates – registration loading', () => {
  it('loads registrations from the registrations port when none are provided', async () => {
    const event = createEvent({ entries: 0, members: 0 })
    const repository = makeRepository({
      getById: jest.fn(async () => event) as unknown as EventRepository['getById'],
      patchAggregates: jest.fn(async () =>
        createEvent({ ...event, entries: 1, members: 0 })
      ) as unknown as EventRepository['patchAggregates'],
    })
    const publisher = makePublisher()
    const reg = createReg()
    const listByEventId = jest.fn<() => Promise<JsonRegistration[]>>(async () => [reg])
    const syncEventAggregates = createSyncEventAggregates({
      publisher,
      registrations: { listByEventId },
      repository,
    })

    const result = await syncEventAggregates({ eventId: event.id })

    expect(listByEventId).toHaveBeenCalledWith(event.id)
    expect(result.changed).toBe(true)
  })

  it('uses provided registrations and skips registrations port', async () => {
    const event = createEvent({ entries: 0, members: 0 })
    const repository = makeRepository({
      getById: jest.fn(async () => event) as unknown as EventRepository['getById'],
      patchAggregates: jest.fn(async () =>
        createEvent({ ...event, entries: 1, members: 0 })
      ) as unknown as EventRepository['patchAggregates'],
    })
    const publisher = makePublisher()
    const listByEventId = jest.fn<() => Promise<JsonRegistration[]>>(async () => [])
    const syncEventAggregates = createSyncEventAggregates({
      publisher,
      registrations: { listByEventId },
      repository,
    })

    await syncEventAggregates({ eventId: event.id, registrations: [createReg()] })

    expect(listByEventId).not.toHaveBeenCalled()
  })

  it('throws when event is not found', async () => {
    const repository = makeRepository({
      getById: jest.fn(async () => undefined) as unknown as EventRepository['getById'],
    })
    const syncEventAggregates = createSyncEventAggregates({
      publisher: makePublisher(),
      registrations: { listByEventId: jest.fn(async () => []) as unknown as () => Promise<JsonRegistration[]> },
      repository,
    })

    await expect(syncEventAggregates({ eventId: 'missing-id' })).rejects.toThrow(
      "Event with id 'missing-id' was not found"
    )
  })
})

describe('createSyncEventAggregates – aggregate patch persistence', () => {
  it('calls patchAggregates when aggregate values changed', async () => {
    const event = createEvent({
      classes: [{ class: 'ALO' as JsonEventClass['class'], date: '2025-01-01', entries: 0, members: 0 }],
      entries: 0,
      members: 0,
    })
    const updated = createEvent({
      ...event,
      classes: [{ class: 'ALO' as JsonEventClass['class'], date: '2025-01-01', entries: 1, members: 0 }],
      entries: 1,
    })
    const repository = makeRepository({
      getById: jest.fn(async () => event) as unknown as EventRepository['getById'],
      patchAggregates: jest.fn(async () => updated) as unknown as EventRepository['patchAggregates'],
    })
    const publisher = makePublisher()
    const syncEventAggregates = createSyncEventAggregates({
      publisher,
      registrations: {
        listByEventId: jest.fn(async () => [createReg()]) as unknown as () => Promise<JsonRegistration[]>,
      },
      repository,
    })

    const result = await syncEventAggregates({ eventId: event.id })

    expect(repository.patchAggregates).toHaveBeenCalledTimes(1)
    const patchArg = (repository.patchAggregates as ReturnType<typeof jest.fn>).mock
      .calls[0]?.[0] as EventAggregatePatch
    expect(patchArg.eventId).toBe(event.id)
    expect(patchArg.set?.entries).toBe(1)
    expect(result.changed).toBe(true)
    expect(result.event).toEqual(updated)
  })

  it('does not call patchAggregates when aggregates are unchanged', async () => {
    // Event already has the correct counts
    const event = createEvent({ classes: [], entries: 0, members: 0 })
    const repository = makeRepository({
      getById: jest.fn(async () => event) as unknown as EventRepository['getById'],
    })
    const publisher = makePublisher()
    const syncEventAggregates = createSyncEventAggregates({
      publisher,
      registrations: {
        listByEventId: jest.fn(async () => []) as unknown as () => Promise<JsonRegistration[]>,
      },
      repository,
    })

    const result = await syncEventAggregates({ eventId: event.id })

    expect(repository.patchAggregates).not.toHaveBeenCalled()
    expect(result.changed).toBe(false)
    expect(result.event).toEqual(event)
  })
})

describe('createSyncEventAggregates – publisher emission', () => {
  it('calls publisher.publishChange after a successful aggregate patch', async () => {
    const event = createEvent({ classes: [], entries: 0, members: 0 })
    const updated = createEvent({ ...event, entries: 2 })
    const repository = makeRepository({
      getById: jest.fn(async () => event) as unknown as EventRepository['getById'],
      patchAggregates: jest.fn(async () => updated) as unknown as EventRepository['patchAggregates'],
    })
    const publisher = makePublisher()
    const syncEventAggregates = createSyncEventAggregates({
      publisher,
      registrations: {
        listByEventId: jest.fn(async () => [
          createReg({ id: 'r1' }),
          createReg({ id: 'r2' }),
        ]) as unknown as () => Promise<JsonRegistration[]>,
      },
      repository,
    })

    await syncEventAggregates({ eventId: event.id })

    expect(publisher.publishChange).toHaveBeenCalledTimes(1)
    const publishArg = (publisher.publishChange as ReturnType<typeof jest.fn>).mock
      .calls[0]?.[0] as PublishEventChangeInput
    expect(publishArg.organizerId).toBe(event.organizer.id)
    expect(publishArg.payload.eventId).toBe(event.id)
    expect(publishArg.payload.entries).toBe(2)
  })

  it('does not call publisher.publishChange on no-op', async () => {
    const event = createEvent({ classes: [], entries: 0, members: 0 })
    const repository = makeRepository({
      getById: jest.fn(async () => event) as unknown as EventRepository['getById'],
    })
    const publisher = makePublisher()
    const syncEventAggregates = createSyncEventAggregates({
      publisher,
      registrations: {
        listByEventId: jest.fn(async () => []) as unknown as () => Promise<JsonRegistration[]>,
      },
      repository,
    })

    await syncEventAggregates({ eventId: event.id })

    expect(publisher.publishChange).not.toHaveBeenCalled()
  })
})
