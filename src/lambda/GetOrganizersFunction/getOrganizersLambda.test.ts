import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockReadOrganizers = vi.fn()
const mockAddOrganizers = vi.fn()
const mockRenameOrganizer = vi.fn()
const mockAuthorize = vi.fn()
const mockNanoid = vi.fn()
const mockGetKLAPIConfig = vi.fn()
const mockLueYhdistykset = vi.fn()

// Mock KLAPI class
class MockKLAPI {
  constructor() {
    // biome-ignore lint/correctness/noConstructorReturn: its a test
    return {
      lueYhdistykset: mockLueYhdistykset,
    }
  }
}

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/repositories/organizerRepository', () => ({
  addOrganizers: mockAddOrganizers,
  readOrganizers: mockReadOrganizers,
  renameOrganizer: mockRenameOrganizer,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: any) => {
    const user = await mockAuthorize(event)
    if (!user) throw httpError(401, 'Unauthorized')
    if (!user.admin) throw httpError(403, 'Forbidden')
    return user
  },
}))

vi.doMock('nanoid', () => ({
  nanoid: mockNanoid,
}))

vi.doMock('../lib/secrets', () => ({
  getKLAPIConfig: mockGetKLAPIConfig,
}))

vi.doMock('../lib/KLAPI', () => ({
  default: MockKLAPI,
}))

const { default: getOrganizersLambda } = await import('./handler')

describe('getOrganizersLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    queryStringParameters: null,
  })

  let consoleLogSpy: import('vitest').MockInstance<any>

  beforeAll(() => {
    consoleLogSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterAll(() => {
    consoleLogSpy.mockRestore()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all organizers in regular mode', async () => {
    const organizers = [
      { id: 'org1', kcId: '123', name: 'Organizer 1' },
      { id: 'org2', kcId: '456', name: 'Organizer 2' },
    ]

    mockReadOrganizers.mockResolvedValueOnce(organizers)

    await getOrganizersLambda(event)

    expect(mockReadOrganizers).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, organizers, event)
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(mockLueYhdistykset).not.toHaveBeenCalled()
  })

  it('returns empty array if no organizers found', async () => {
    mockReadOrganizers.mockResolvedValueOnce([])

    await getOrganizersLambda(event)

    expect(mockReadOrganizers).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('calls refreshOrganizersLambda when refresh parameter is present', async () => {
    const eventWithRefresh = {
      ...event,
      queryStringParameters: { refresh: '' },
    }

    const user = { admin: true, id: 'admin1' }
    const organizers = [
      { id: 'org1', kcId: '123', name: 'Organizer 1' },
      { id: 'org2', kcId: '456', name: 'Organizer 2' },
    ]

    mockAuthorize.mockResolvedValueOnce(user)
    mockLueYhdistykset.mockResolvedValueOnce({
      json: [
        { jäsennumero: '123', strYhdistys: 'Organizer 1' },
        { jäsennumero: '456', strYhdistys: 'Organizer 2' },
        { jäsennumero: '789', strYhdistys: 'Organizer 3' },
      ],
      status: 200,
    })
    mockReadOrganizers.mockResolvedValueOnce(organizers) // First call for existing organizers
    mockNanoid.mockReturnValueOnce('org3')
    mockAddOrganizers.mockResolvedValueOnce(undefined)
    mockReadOrganizers.mockResolvedValueOnce([...organizers, { id: 'org3', kcId: '789', name: 'Organizer 3' }]) // Second call after refresh

    await getOrganizersLambda(eventWithRefresh)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithRefresh)
    expect(mockLueYhdistykset).toHaveBeenCalled()
    expect(mockReadOrganizers).toHaveBeenCalledTimes(2)
    expect(mockAddOrganizers).toHaveBeenCalledWith([{ id: 'org3', kcId: '789', name: 'Organizer 3' }])
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      [...organizers, { id: 'org3', kcId: '789', name: 'Organizer 3' }],
      eventWithRefresh
    )
  })

  it('returns 403 in refresh mode if user is not admin', async () => {
    const eventWithRefresh = {
      ...event,
      queryStringParameters: { refresh: '' },
    }

    const user = { admin: false, id: 'user1' }

    mockAuthorize.mockResolvedValueOnce(user)

    await getOrganizersLambda(eventWithRefresh)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithRefresh)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', eventWithRefresh)
    expect(mockLueYhdistykset).not.toHaveBeenCalled()
    expect(mockReadOrganizers).not.toHaveBeenCalled()
  })

  it('updates organizer name if changed in KLAPI', async () => {
    const eventWithRefresh = {
      ...event,
      queryStringParameters: { refresh: '' },
    }

    const user = { admin: true, id: 'admin1' }
    const organizers = [{ id: 'org1', kcId: '123', name: 'Old Name' }]

    mockAuthorize.mockResolvedValueOnce(user)
    mockLueYhdistykset.mockResolvedValueOnce({
      json: [{ jäsennumero: '123', strYhdistys: 'New Name' }],
      status: 200,
    })
    mockReadOrganizers.mockResolvedValueOnce(organizers) // First call for existing organizers
    mockRenameOrganizer.mockResolvedValueOnce(undefined)
    mockReadOrganizers.mockResolvedValueOnce([{ id: 'org1', kcId: '123', name: 'New Name' }]) // Second call after refresh

    await getOrganizersLambda(eventWithRefresh)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithRefresh)
    expect(mockLueYhdistykset).toHaveBeenCalled()
    expect(mockReadOrganizers).toHaveBeenCalledTimes(2)
    expect(mockRenameOrganizer).toHaveBeenCalledWith('org1', 'New Name')
    expect(mockResponse).toHaveBeenCalledWith(200, [{ id: 'org1', kcId: '123', name: 'New Name' }], eventWithRefresh)

    // Verify the name change was logged
    expect(loggedLines(consoleLogSpy)).toContainEqual(
      expect.objectContaining({
        kcId: organizers[0].kcId,
        message: 'organizer name changed',
        name: 'New Name',
        previous: organizers[0].name,
      })
    )
  })

  it('renames every organizer the Kennel Club reports under a new name and adds the new ones', async () => {
    const eventWithRefresh = {
      ...event,
      queryStringParameters: { refresh: '' },
    }
    const organizers = [
      { id: 'org1', kcId: '123', name: 'Old 1' },
      { id: 'org2', kcId: '456', name: 'Same' },
      { id: 'org3', kcId: '789', name: 'Old 3' },
    ]

    mockAuthorize.mockResolvedValueOnce({ admin: true, id: 'admin1' })
    mockLueYhdistykset.mockResolvedValueOnce({
      json: [
        { jäsennumero: '123', strYhdistys: 'New 1' },
        { jäsennumero: '456', strYhdistys: 'Same' },
        { jäsennumero: '789', strYhdistys: 'New 3' },
        { jäsennumero: '999', strYhdistys: 'Added' },
      ],
      status: 200,
    })
    mockReadOrganizers.mockResolvedValueOnce(organizers)
    mockNanoid.mockReturnValueOnce('org4')
    mockReadOrganizers.mockResolvedValueOnce([])

    await getOrganizersLambda(eventWithRefresh)

    expect(mockRenameOrganizer).toHaveBeenCalledTimes(2)
    expect(mockRenameOrganizer).toHaveBeenCalledWith('org1', 'New 1')
    expect(mockRenameOrganizer).toHaveBeenCalledWith('org3', 'New 3')
    expect(mockAddOrganizers).toHaveBeenCalledWith([{ id: 'org4', kcId: '999', name: 'Added' }])
    const lines = loggedLines(consoleLogSpy).filter((line) => line.message === 'organizer name changed')
    expect(lines).toEqual([
      expect.objectContaining({ kcId: '123', name: 'New 1', previous: 'Old 1' }),
      expect.objectContaining({ kcId: '789', name: 'New 3', previous: 'Old 3' }),
    ])
  })
})
