import { vi } from 'vitest'

const mockFetchLocations = vi.fn()
const mockSyncLocations = vi.fn()
const mockPublishAdminDataInvalidation = vi.fn()

vi.doMock('../lib/location', () => ({
  fetchLocations: mockFetchLocations,
  syncLocations: mockSyncLocations,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

vi.doMock('../lib/KLAPI', () => ({
  default: vi.fn(function MockKLAPI() {
    return {}
  }),
}))

vi.doMock('../lib/secrets', () => ({
  getKLAPIConfig: vi.fn(),
}))

const { default: refreshLocations } = await import('./handler')

const locations = [{ district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' }]

describe('refreshLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores the locations and invalidates admin caches when they changed', async () => {
    mockFetchLocations.mockResolvedValueOnce(locations)
    mockSyncLocations.mockResolvedValueOnce(true)

    await refreshLocations()

    expect(mockSyncLocations).toHaveBeenCalledWith(locations)
    expect(mockPublishAdminDataInvalidation).toHaveBeenCalledWith(['locations'])
  })

  it('does not invalidate admin caches when nothing changed', async () => {
    mockFetchLocations.mockResolvedValueOnce(locations)
    mockSyncLocations.mockResolvedValueOnce(false)

    await refreshLocations()

    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
  })

  it('throws and leaves the stored snapshot alone when KLAPI returns nothing', async () => {
    mockFetchLocations.mockResolvedValueOnce(undefined)

    await expect(refreshLocations()).rejects.toThrow('refreshLocations: KLAPI returned no locations')

    expect(mockSyncLocations).not.toHaveBeenCalled()
    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
  })
})
