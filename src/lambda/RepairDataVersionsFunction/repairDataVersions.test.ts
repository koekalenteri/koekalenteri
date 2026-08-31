import { vi } from 'vitest'

const mockReadAll = vi.fn()
const mockRead = vi.fn()
const mockReadStored = vi.fn()
const mockWriteFingerprint = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: mockRead, readAll: mockReadAll }
  }),
}))

vi.doMock('../lib/dataVersions', () => ({
  // Vitest replaces the whole module, so the scope constant has to come along.
  GLOBAL_SCOPE: '*',
  readStoredDataVersions: mockReadStored,
  writeDataVersionFingerprint: mockWriteFingerprint,
}))

const { default: repairDataVersions } = await import('./handler')

const users = [
  { id: 'u1', modifiedAt: '2026-01-02T00:00:00.000Z', roles: { org1: 'secretary' } },
  { id: 'u2', judge: ['NOME-B'], modifiedAt: '2026-01-03T00:00:00.000Z' },
]

const organizers = [
  { id: 'o1', name: 'Yhdistys A' },
  { id: 'o2', name: 'Yhdistys B' },
]

const setup = () => {
  // emailTemplates, eventTypes, judges, officials, then organizers and users
  mockReadAll.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
  mockReadAll.mockResolvedValueOnce(organizers)
  mockReadAll.mockResolvedValueOnce(users)
  mockRead.mockResolvedValueOnce({ count: 309, modifiedAt: '2026-01-01T00:00:00.000Z' })
}

describe('repairDataVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mockWriteFingerprint.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records fingerprints without reminting on the first run', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'locations',
      '*',
      { count: 309, fingerprintAt: '2026-01-01T00:00:00.000Z' },
      false
    )
    // Organizer rows carry no timestamp, so only the count is measurable.
    expect(mockWriteFingerprint).toHaveBeenCalledWith('organizers', '*', { count: 2, fingerprintAt: undefined }, false)
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'org1',
      { count: 1, fingerprintAt: '2026-01-02T00:00:00.000Z' },
      false
    )
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'directory',
      { count: 1, fingerprintAt: '2026-01-03T00:00:00.000Z' },
      false
    )
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      '*',
      { count: 2, fingerprintAt: '2026-01-03T00:00:00.000Z' },
      false
    )
    expect(mockWriteFingerprint).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), true)
  })

  it('leaves matching fingerprints alone', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      { collection: 'emailTemplates', count: 0, fingerprintAt: '', scope: '*' },
      { collection: 'eventTypes', count: 0, fingerprintAt: '', scope: '*' },
      { collection: 'judges', count: 0, fingerprintAt: '', scope: '*' },
      { collection: 'officials', count: 0, fingerprintAt: '', scope: '*' },
      { collection: 'locations', count: 309, fingerprintAt: '2026-01-01T00:00:00.000Z', scope: '*' },
      { collection: 'organizers', count: 2, fingerprintAt: '', scope: '*' },
      { collection: 'users', count: 2, fingerprintAt: '2026-01-03T00:00:00.000Z', scope: '*' },
      { collection: 'users', count: 1, fingerprintAt: '2026-01-03T00:00:00.000Z', scope: 'directory' },
      { collection: 'users', count: 1, fingerprintAt: '2026-01-02T00:00:00.000Z', scope: 'org1' },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).not.toHaveBeenCalled()
  })

  it('remints a scope whose data moved without a bump', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      { collection: 'users', count: 1, fingerprintAt: '2026-01-01T00:00:00.000Z', revision: 'stale', scope: 'org1' },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'org1',
      { count: 1, fingerprintAt: '2026-01-02T00:00:00.000Z' },
      true
    )
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('data version drift repaired: users#org1'))
  })

  it('empties a scope that has no records left', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      { collection: 'users', count: 3, fingerprintAt: '2026-01-01T00:00:00.000Z', scope: 'org-gone' },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith('users', 'org-gone', { count: 0 }, true)
  })
})
