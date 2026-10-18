import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

const mockReadEmailTemplates = vi.fn()
const mockGetAllUsers = vi.fn()
const mockReadEventTypes = vi.fn()
const mockReadJudges = vi.fn()
const mockReadOfficials = vi.fn()
const mockReadLocationSnapshot = vi.fn()
const mockReadOrganizers = vi.fn()
const mockReadStored = vi.fn()
const mockWriteFingerprint = vi.fn()

vi.doMock('../lib/repositories/emailTemplateRepository', () => ({ readEmailTemplates: mockReadEmailTemplates }))
vi.doMock('../lib/repositories/eventTypeRepository', () => ({ readEventTypes: mockReadEventTypes }))
vi.doMock('../lib/repositories/judgeRepository', () => ({ readJudges: mockReadJudges }))
vi.doMock('../lib/repositories/officialRepository', () => ({ readOfficials: mockReadOfficials }))
vi.doMock('../lib/repositories/locationRepository', () => ({ readLocationSnapshot: mockReadLocationSnapshot }))
vi.doMock('../lib/repositories/organizerRepository', () => ({ readOrganizers: mockReadOrganizers }))
// The scopes are the real rule; only the table read is replaced.
vi.doMock('../lib/user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/user')>()),
  getAllUsers: mockGetAllUsers,
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
  mockReadEmailTemplates.mockResolvedValueOnce([])
  mockGetAllUsers.mockResolvedValueOnce(users)
  mockReadEventTypes.mockResolvedValueOnce([])
  mockReadJudges.mockResolvedValueOnce([])
  mockReadOfficials.mockResolvedValueOnce([])
  mockReadLocationSnapshot.mockResolvedValueOnce({ count: 309, modifiedAt: '2026-01-01T00:00:00.000Z' })
  mockReadOrganizers.mockResolvedValueOnce(organizers)
}

describe('repairDataVersions', () => {
  let infoSpy = vi.spyOn(console, 'info')

  beforeEach(() => {
    vi.clearAllMocks()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
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
    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({ message: 'data version drift repaired', reminted: ['users#org1'] })
    )
  })

  it('empties a scope that has no records left', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      { collection: 'users', count: 3, fingerprintAt: '2026-01-01T00:00:00.000Z', scope: 'org-gone' },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith('users', 'org-gone', { count: 0 }, true)
  })

  it('measures an email template table that reads as nothing as empty', async () => {
    setup()
    mockReadEmailTemplates.mockReset().mockResolvedValueOnce(undefined)
    mockReadStored.mockResolvedValueOnce([
      { collection: 'emailTemplates', count: 2, fingerprintAt: '2026-01-01T00:00:00.000Z', scope: '*' },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'emailTemplates',
      '*',
      { count: 0, fingerprintAt: undefined },
      true
    )
  })
})
