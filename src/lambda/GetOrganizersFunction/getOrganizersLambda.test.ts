import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockReadAll = jest.fn<any>()
const mockBatchWrite = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockNanoid = jest.fn<any>()
const mockGetKLAPIConfig = jest.fn<any>()
const mockLueYhdistykset = jest.fn<any>()

// Mock KLAPI class
class MockKLAPI {
  constructor() {
    return {
      lueYhdistykset: mockLueYhdistykset,
    }
  }
}

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    readAll: mockReadAll,
    batchWrite: mockBatchWrite,
    update: mockUpdate,
  })),
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('nanoid', () => ({
  nanoid: mockNanoid,
}))

jest.unstable_mockModule('../lib/secrets', () => ({
  getKLAPIConfig: mockGetKLAPIConfig,
}))

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: MockKLAPI,
}))

const { default: getOrganizersLambda } = await import('./handler')

describe('getOrganizersLambda', () => {
  const event = {
    headers: {},
    body: '',
    queryStringParameters: null,
  } as any

  let consoleLogSpy: jest.SpiedFunction<any>

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterAll(() => {
    consoleLogSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
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

    const user = { id: 'admin1', admin: true }
    const organizers = [
      { id: 'org1', kcId: '123', name: 'Organizer 1' },
      { id: 'org2', kcId: '456', name: 'Organizer 2' },
    ]

    mockAuthorize.mockResolvedValueOnce(user)
    mockLueYhdistykset.mockResolvedValueOnce({
      status: 200,
      json: [
        { jäsennumero: '123', strYhdistys: 'Organizer 1' },
        { jäsennumero: '456', strYhdistys: 'Organizer 2' },
        { jäsennumero: '789', strYhdistys: 'Organizer 3' },
      ],
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

  it('returns 401 in refresh mode if user is not admin', async () => {
    const eventWithRefresh = {
      ...event,
      queryStringParameters: { refresh: '' },
    }

    const user = { id: 'user1', admin: false }

    mockAuthorize.mockResolvedValueOnce(user)

    await getOrganizersLambda(eventWithRefresh)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithRefresh)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', eventWithRefresh)
    expect(mockLueYhdistykset).not.toHaveBeenCalled()
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('updates organizer name if changed in KLAPI', async () => {
    const eventWithRefresh = {
      ...event,
      queryStringParameters: { refresh: '' },
    }

    const user = { id: 'admin1', admin: true }
    const organizers = [{ id: 'org1', kcId: '123', name: 'Old Name' }]

    mockAuthorize.mockResolvedValueOnce(user)
    mockLueYhdistykset.mockResolvedValueOnce({
      status: 200,
      json: [{ jäsennumero: '123', strYhdistys: 'New Name' }],
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
