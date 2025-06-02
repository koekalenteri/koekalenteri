import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockWrite = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    write: mockWrite,
  })),
}))

const { default: putOrganizerLambda } = await import('./handler')

describe('putOrganizerLambda', () => {
  const event = {
    body: JSON.stringify({
      id: 'org123',
      name: 'Test Organizer',
      email: 'test@example.com',
      paytrailMerchantId: 'merchant123',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
      admin: true,
    })

    mockParseJSONWithFallback.mockReturnValue({
      id: 'org123',
      name: 'Test Organizer',
      email: 'test@example.com',
      paytrailMerchantId: 'merchant123',
    })

    mockRead.mockResolvedValue({
      id: 'org123',
      name: 'Old Organizer Name',
      email: 'old@example.com',
    })

    mockWrite.mockResolvedValue({})
  })

  it('returns 401 if not authorized as admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test User',
      admin: false,
    })

    await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('returns 400 if organizer id is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      name: 'Test Organizer',
      email: 'test@example.com',
    })

    await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(400, 'no data', event)
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('creates a new organizer if it does not exist', async () => {
    mockRead.mockResolvedValueOnce(null)

    await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith({ id: 'org123' })

    // Verify organizer was written to database
    expect(mockWrite).toHaveBeenCalledWith({
      id: 'org123',
      name: 'Test Organizer',
      email: 'test@example.com',
      paytrailMerchantId: 'merchant123',
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'org123',
        name: 'Test Organizer',
        email: 'test@example.com',
        paytrailMerchantId: 'merchant123',
      },
      event
    )
  })

  it('updates an existing organizer', async () => {
    await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith({ id: 'org123' })

    // Verify organizer was written to database with merged data
    expect(mockWrite).toHaveBeenCalledWith({
      id: 'org123',
      name: 'Test Organizer',
      email: 'test@example.com',
      paytrailMerchantId: 'merchant123',
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'org123',
        name: 'Test Organizer',
        email: 'test@example.com',
        paytrailMerchantId: 'merchant123',
      },
      event
    )
  })

  it('preserves existing fields when updating', async () => {
    mockRead.mockResolvedValueOnce({
      id: 'org123',
      name: 'Old Organizer Name',
      email: 'old@example.com',
      phone: '1234567890', // Additional field
      address: '123 Main St', // Additional field
    })

    mockParseJSONWithFallback.mockReturnValueOnce({
      id: 'org123',
      name: 'Test Organizer',
      // email not provided in update
    })

    await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith({ id: 'org123' })

    // Verify organizer was written to database with merged data
    expect(mockWrite).toHaveBeenCalledWith({
      id: 'org123',
      name: 'Test Organizer',
      email: 'old@example.com', // Preserved from existing
      phone: '1234567890', // Preserved from existing
      address: '123 Main St', // Preserved from existing
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'org123',
        name: 'Test Organizer',
        email: 'old@example.com',
        phone: '1234567890',
        address: '123 Main St',
      },
      event
    )
  })
})
