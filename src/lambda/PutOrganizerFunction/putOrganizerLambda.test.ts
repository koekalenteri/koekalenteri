import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockWrite = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../organizer/repository', () => ({
  organizerRepository: {
    getById: mockRead,
    write: mockWrite,
  },
}))

const { putOrganizerLambda } = await import('./handler')

describe('putOrganizerLambda', () => {
  const event = {
    body: JSON.stringify({
      email: 'test@example.com',
      id: 'org123',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test User',
    })

    mockParseJSONWithFallback.mockReturnValue({
      email: 'test@example.com',
      id: 'org123',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    })

    mockRead.mockResolvedValue({
      email: 'old@example.com',
      id: 'org123',
      name: 'Old Organizer Name',
    })

    mockWrite.mockResolvedValue({})
  })

  it('returns 401 if not authorized as admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
    })

    const result = await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('returns 400 if organizer id is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      email: 'test@example.com',
      name: 'Test Organizer',
    })

    const result = await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(400)
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('creates a new organizer if it does not exist', async () => {
    mockRead.mockResolvedValueOnce(null)

    const result = await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith('org123')

    // Verify organizer was written to database
    expect(mockWrite).toHaveBeenCalledWith({
      email: 'test@example.com',
      id: 'org123',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    })

    expect(result.statusCode).toBe(200)
  })

  it('updates an existing organizer', async () => {
    const result = await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith('org123')

    // Verify organizer was written to database with merged data
    expect(mockWrite).toHaveBeenCalledWith({
      email: 'test@example.com',
      id: 'org123',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    })

    expect(result.statusCode).toBe(200)
  })

  it('preserves existing fields when updating', async () => {
    mockRead.mockResolvedValueOnce({
      address: '123 Main St', // Additional field
      email: 'old@example.com',
      id: 'org123',
      name: 'Old Organizer Name',
      phone: '1234567890', // Additional field
    })

    mockParseJSONWithFallback.mockReturnValueOnce({
      id: 'org123',
      name: 'Test Organizer',
      // email not provided in update
    })

    const result = await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith('org123')

    // Verify organizer was written to database with merged data
    expect(mockWrite).toHaveBeenCalledWith({
      address: '123 Main St', // Preserved from existing
      email: 'old@example.com', // Preserved from existing
      id: 'org123',
      name: 'Test Organizer',
      phone: '1234567890', // Preserved from existing
    })

    expect(result.statusCode).toBe(200)
  })
})
