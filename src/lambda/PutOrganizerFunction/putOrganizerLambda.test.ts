import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
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

    await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('returns 400 if organizer id is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      email: 'test@example.com',
      name: 'Test Organizer',
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
      email: 'test@example.com',
      id: 'org123',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        email: 'test@example.com',
        id: 'org123',
        name: 'Test Organizer',
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
      email: 'test@example.com',
      id: 'org123',
      name: 'Test Organizer',
      paytrailMerchantId: 'merchant123',
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        email: 'test@example.com',
        id: 'org123',
        name: 'Test Organizer',
        paytrailMerchantId: 'merchant123',
      },
      event
    )
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

    await putOrganizerLambda(event)

    // Verify organizer was read from database
    expect(mockRead).toHaveBeenCalledWith({ id: 'org123' })

    // Verify organizer was written to database with merged data
    expect(mockWrite).toHaveBeenCalledWith({
      address: '123 Main St', // Preserved from existing
      email: 'old@example.com', // Preserved from existing
      id: 'org123',
      name: 'Test Organizer',
      phone: '1234567890', // Preserved from existing
    })

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        address: '123 Main St',
        email: 'old@example.com',
        id: 'org123',
        name: 'Test Organizer',
        phone: '1234567890',
      },
      event
    )
  })
})
