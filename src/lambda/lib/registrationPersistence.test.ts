import type { JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { registrationWithStaticDates } from '../../__mockData__/registrations'

const releaseGroups = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
const releasePayments = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
const mockFixRegistrationGroups = vi.fn<(registrations: JsonRegistration[]) => Promise<JsonRegistration[]>>()
const mockLockRegistrationGroups = vi.fn<() => Promise<() => Promise<void>>>().mockResolvedValue(releaseGroups)
const mockLockRegistrationPayments = vi.fn<() => Promise<() => Promise<void>>>().mockResolvedValue(releasePayments)

vi.doMock('./event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  lockRegistrationGroups: mockLockRegistrationGroups,
  lockRegistrationPayments: mockLockRegistrationPayments,
}))

const mockFindExistingRegistrationToEventForDog = vi.fn<() => Promise<JsonRegistration | undefined>>()
const mockGetReadyRegistrationsByEventId = vi.fn<() => Promise<JsonRegistration[]>>()
const mockPatchRegistration = vi.fn<() => Promise<JsonRegistration>>()
const mockSaveRegistration = vi.fn<() => Promise<void>>()
const registrationLib = await import('./registration')

vi.doMock('./registration', () => ({
  ...registrationLib,
  findExistingRegistrationToEventForDog: mockFindExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  patchRegistration: mockPatchRegistration,
  saveRegistration: mockSaveRegistration,
}))

const { persistRegistrationWithGroups } = await import('./registrationPersistence')

describe('persistRegistrationWithGroups', () => {
  const user = { name: 'Test User' }
  const registration: JsonRegistration = {
    ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
    creationIdempotencyKey: 'create-key',
    group: { key: 'reserve', number: 2 },
    state: 'ready',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindExistingRegistrationToEventForDog.mockResolvedValue(undefined)
    mockGetReadyRegistrationsByEventId.mockResolvedValue([])
    mockFixRegistrationGroups.mockImplementation(async (registrations) => {
      const current = registrations.at(-1)
      if (current) current.group = { key: 'reserve', number: 1 }
      return registrations
    })
    mockPatchRegistration.mockResolvedValue(registration)
    mockSaveRegistration.mockResolvedValue(undefined)
  })

  it('saves and reconciles a new ready registration while holding both locks', async () => {
    const result = await persistRegistrationWithGroups(registration, undefined, user)

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'saved',
        savedData: expect.objectContaining({ group: { key: 'reserve', number: 1 } }),
      })
    )
    expect(mockSaveRegistration).toHaveBeenCalledWith(registration)
    expect(mockGetReadyRegistrationsByEventId).toHaveBeenCalledWith(registration.eventId, true)
    expect(releaseGroups).toHaveBeenCalledTimes(1)
    expect(releasePayments).toHaveBeenCalledTimes(1)
  })

  it('returns a conflict without saving when another creation owns the dog and event', async () => {
    const concurrent = { ...registration, creationIdempotencyKey: 'other-key', id: 'other-id' }
    mockFindExistingRegistrationToEventForDog.mockResolvedValue(concurrent)

    await expect(persistRegistrationWithGroups(registration, undefined, user)).resolves.toEqual({
      conflict: concurrent,
      kind: 'conflict',
    })
    expect(mockSaveRegistration).not.toHaveBeenCalled()
    expect(mockLockRegistrationGroups).not.toHaveBeenCalled()
    expect(releasePayments).toHaveBeenCalledTimes(1)
  })

  it('resumes an idempotent creation without writing the registration again', async () => {
    const concurrent = { ...registration, id: 'concurrent-id' }
    mockFindExistingRegistrationToEventForDog.mockResolvedValue(concurrent)

    const result = await persistRegistrationWithGroups(registration, undefined, user)

    expect(result).toEqual(
      expect.objectContaining({ kind: 'saved', savedData: expect.objectContaining({ id: concurrent.id }) })
    )
    expect(mockSaveRegistration).not.toHaveBeenCalled()
  })

  it('patches an existing registration without reserving the dog', async () => {
    const existing = { ...registration, notes: 'old' }
    const patched = { ...registration, notes: 'new' }
    mockPatchRegistration.mockResolvedValue(patched)

    const result = await persistRegistrationWithGroups(patched, existing, user)

    expect(mockPatchRegistration).toHaveBeenCalledWith(patched.eventId, patched.id, existing, patched)
    expect(result).toEqual(
      expect.objectContaining({ kind: 'saved', savedData: expect.objectContaining({ notes: 'new' }) })
    )
    expect(mockLockRegistrationPayments).not.toHaveBeenCalled()
  })

  it('releases acquired locks when persistence fails', async () => {
    mockSaveRegistration.mockRejectedValue(new Error('write failed'))

    await expect(persistRegistrationWithGroups(registration, undefined, user)).rejects.toThrow('write failed')
    expect(releaseGroups).toHaveBeenCalledTimes(1)
    expect(releasePayments).toHaveBeenCalledTimes(1)
  })

  it('saves a non-ready registration without acquiring locks or reconciling groups', async () => {
    const creating = { ...registration, state: 'creating' as const }

    await expect(persistRegistrationWithGroups(creating, undefined, user)).resolves.toEqual({
      groupPatches: [],
      kind: 'saved',
      savedData: creating,
    })
    expect(mockLockRegistrationGroups).not.toHaveBeenCalled()
    expect(mockLockRegistrationPayments).not.toHaveBeenCalled()
    expect(mockGetReadyRegistrationsByEventId).not.toHaveBeenCalled()
  })
})
