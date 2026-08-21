import { vi } from 'vitest'

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockReadAll = vi.fn()
const mockBatchWrite = vi.fn()
const mockUpdate = vi.fn()
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

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      batchWrite: mockBatchWrite,
      readAll: mockReadAll,
      update: mockUpdate,
    }
  }),
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: any) => {
    const user = await mockAuthorize(event)
    if (!user) return { res: mockResponse(401, 'Unauthorized', event) ?? { statusCode: 401 } }
    if (!user.admin) return { res: mockResponse(403, 'Forbidden', event) ?? { statusCode: 403 }, user }
    return { user }
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
  const event = {
    body: '',
    headers: {},
    queryStringParameters: null,
  } as any

  let consoleLogSpy: import('vitest').MockInstance<any>

  beforeAll(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
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

    mockReadAll.mockResolvedValueOnce(organizers)

    await getOrganizersLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, organizers, event)
    expect(mockAuthorize).not.toHaveBeenCalled()
    expect(mockLueYhdistykset).not.toHaveBeenCalled()
  })

  it('returns empty array if no organizers found', async () => {
    mockReadAll.mockResolvedValueOnce([])

    await getOrganizersLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns undefined if readAll returns undefined', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await getOrganizersLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
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
    mockReadAll.mockResolvedValueOnce(organizers) // First call for existing organizers
    mockNanoid.mockReturnValueOnce('org3')
    mockBatchWrite.mockResolvedValueOnce(undefined)
    mockReadAll.mockResolvedValueOnce([...organizers, { id: 'org3', kcId: '789', name: 'Organizer 3' }]) // Second call after refresh

    await getOrganizersLambda(eventWithRefresh)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithRefresh)
    expect(mockLueYhdistykset).toHaveBeenCalled()
    expect(mockReadAll).toHaveBeenCalledTimes(2)
    expect(mockBatchWrite).toHaveBeenCalledWith([{ id: 'org3', kcId: '789', name: 'Organizer 3' }])
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
    expect(mockReadAll).not.toHaveBeenCalled()
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
    mockReadAll.mockResolvedValueOnce(organizers) // First call for existing organizers
    mockUpdate.mockResolvedValueOnce(undefined)
    mockReadAll.mockResolvedValueOnce([{ id: 'org1', kcId: '123', name: 'New Name' }]) // Second call after refresh

    await getOrganizersLambda(eventWithRefresh)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithRefresh)
    expect(mockLueYhdistykset).toHaveBeenCalled()
    expect(mockReadAll).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'org1' }, { set: { name: 'New Name' } })
    expect(mockResponse).toHaveBeenCalledWith(200, [{ id: 'org1', kcId: '123', name: 'New Name' }], eventWithRefresh)

    // Verify console.log was called with the name change message
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Organizer ${organizers[0].kcId} name changed from ${organizers[0].name} to New Name`,
      organizers[0],
      { jäsennumero: '123', strYhdistys: 'New Name' }
    )
  })
})
