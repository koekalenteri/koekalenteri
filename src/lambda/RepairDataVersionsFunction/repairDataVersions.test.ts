import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

vi.useFakeTimers()
vi.setSystemTime(new Date('2026-10-25T02:40:00Z'))
/** When this run started measuring, stored on every row it writes. */
const NOW = '2026-10-25T02:40:00.000Z'
/** The previous weekly run. */
const LAST_CHECK = '2026-10-18T02:40:00.000Z'

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
      NOW,
      false
    )
    // Organizer rows carry no timestamp, so only the count is measurable.
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'organizers',
      '*',
      { count: 2, fingerprintAt: undefined },
      NOW,
      false
    )
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'org1',
      { count: 1, fingerprintAt: '2026-01-02T00:00:00.000Z' },
      NOW,
      false
    )
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'directory',
      { count: 1, fingerprintAt: '2026-01-03T00:00:00.000Z' },
      NOW,
      false
    )
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      '*',
      { count: 2, fingerprintAt: '2026-01-03T00:00:00.000Z' },
      NOW,
      false
    )
    expect(mockWriteFingerprint).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true
    )
  })

  it('leaves matching fingerprints alone', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      { checkedAt: LAST_CHECK, collection: 'emailTemplates', count: 0, fingerprintAt: '', scope: '*' },
      { checkedAt: LAST_CHECK, collection: 'eventTypes', count: 0, fingerprintAt: '', scope: '*' },
      { checkedAt: LAST_CHECK, collection: 'judges', count: 0, fingerprintAt: '', scope: '*' },
      { checkedAt: LAST_CHECK, collection: 'officials', count: 0, fingerprintAt: '', scope: '*' },
      {
        checkedAt: LAST_CHECK,
        collection: 'locations',
        count: 309,
        fingerprintAt: '2026-01-01T00:00:00.000Z',
        scope: '*',
      },
      { checkedAt: LAST_CHECK, collection: 'organizers', count: 2, fingerprintAt: '', scope: '*' },
      { checkedAt: LAST_CHECK, collection: 'users', count: 2, fingerprintAt: '2026-01-03T00:00:00.000Z', scope: '*' },
      {
        checkedAt: LAST_CHECK,
        collection: 'users',
        count: 1,
        fingerprintAt: '2026-01-03T00:00:00.000Z',
        scope: 'directory',
      },
      {
        checkedAt: LAST_CHECK,
        collection: 'users',
        count: 1,
        fingerprintAt: '2026-01-02T00:00:00.000Z',
        scope: 'org1',
      },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).not.toHaveBeenCalled()
  })

  it('remints a scope whose data moved without a bump', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      {
        checkedAt: LAST_CHECK,
        collection: 'users',
        count: 1,
        fingerprintAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-10-11T02:40:00.000Z',
        revision: 'stale',
        scope: 'org1',
      },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'org1',
      { count: 1, fingerprintAt: '2026-01-02T00:00:00.000Z' },
      NOW,
      true
    )
    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({ message: 'data version drift repaired', reminted: ['users#org1'] })
    )
  })

  it('records the new fingerprint of a scope that was bumped after the last check, without drift', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      {
        checkedAt: LAST_CHECK,
        collection: 'locations',
        count: 300,
        fingerprintAt: '2025-12-01T00:00:00.000Z',
        // RefreshLocationsFunction bumps right after its sync, a week after the last check.
        modifiedAt: '2026-10-25T02:20:05.000Z',
        revision: 'bumped',
        scope: '*',
      },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'locations',
      '*',
      { count: 309, fingerprintAt: '2026-01-01T00:00:00.000Z' },
      NOW,
      false
    )
    expect(loggedLines(infoSpy)).not.toContainEqual(expect.objectContaining({ message: 'data version drift repaired' }))
    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({ message: 'data versions checked', reminted: 0 })
    )
  })

  it('moves the check forward on a scope that was bumped although its fingerprint did not move', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      {
        checkedAt: LAST_CHECK,
        collection: 'organizers',
        count: 2,
        fingerprintAt: '',
        // A rename bumps without changing the count, the only thing measured of organizers.
        modifiedAt: '2026-10-20T10:00:00.000Z',
        revision: 'renamed',
        scope: '*',
      },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'organizers',
      '*',
      { count: 2, fingerprintAt: undefined },
      NOW,
      false
    )
  })

  it('does not report drift on a row fingerprinted before checks were stored', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      {
        collection: 'locations',
        count: 300,
        fingerprintAt: '2025-12-01T00:00:00.000Z',
        modifiedAt: '2026-10-25T02:20:05.000Z',
        revision: 'bumped',
        scope: '*',
      },
      { collection: 'organizers', count: 2, fingerprintAt: '', scope: '*' },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'locations',
      '*',
      { count: 309, fingerprintAt: '2026-01-01T00:00:00.000Z' },
      NOW,
      false
    )
    // Unchanged, but written once so that the next run has a check to compare against.
    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'organizers',
      '*',
      { count: 2, fingerprintAt: undefined },
      NOW,
      false
    )
    expect(loggedLines(infoSpy)).not.toContainEqual(expect.objectContaining({ message: 'data version drift repaired' }))
  })

  it('empties a scope that has no records left', async () => {
    setup()
    mockReadStored.mockResolvedValueOnce([
      {
        checkedAt: LAST_CHECK,
        collection: 'users',
        count: 3,
        fingerprintAt: '2026-01-01T00:00:00.000Z',
        scope: 'org-gone',
      },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith('users', 'org-gone', { count: 0 }, NOW, true)
  })

  it('measures an email template table that reads as nothing as empty', async () => {
    setup()
    mockReadEmailTemplates.mockReset().mockResolvedValueOnce(undefined)
    mockReadStored.mockResolvedValueOnce([
      {
        checkedAt: LAST_CHECK,
        collection: 'emailTemplates',
        count: 2,
        fingerprintAt: '2026-01-01T00:00:00.000Z',
        scope: '*',
      },
    ])

    await repairDataVersions()

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'emailTemplates',
      '*',
      { count: 0, fingerprintAt: undefined },
      NOW,
      true
    )
  })
})
