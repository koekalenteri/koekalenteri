import { jest } from '@jest/globals'
import { ServiceException } from '@smithy/smithy-client'

// Mock the events import
jest.unstable_mockModule('./demo-events', () => ({
  events: [{ id: 'demo-event-1' }, { id: 'demo-event-2' }],
}))

const mockResponse = jest.fn<any>()
const mockBatchWrite = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  response: mockResponse,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    batchWrite: mockBatchWrite,
  })),
}))

// Store original env
const originalEnv = process.env

describe('demoEvents', () => {
  let demoEventsHandler: any
  let errorSpy: jest.SpiedFunction<any>

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks()

    // Reset env for each test
    process.env = { ...originalEnv }

    // Spy on console.error
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    // Import the handler after mocks are set up
    const module = await import('./handler')
    demoEventsHandler = module.default
  })

  afterEach(() => {
    // Restore console.error after each test
    errorSpy.mockRestore()
  })

  afterAll(() => {
    // Restore original env
    process.env = originalEnv
  })

  it('returns 401 when not in dev environment', async () => {
    // Set environment to something other than dev
    process.env.STAGE_NAME = 'prod'

    const event = { headers: {}, body: '' } as any

    await demoEventsHandler(event)

    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })

  it('successfully creates demo events in dev environment', async () => {
    // Set environment to dev
    process.env.STAGE_NAME = 'dev'

    const event = { headers: {}, body: '' } as any
    mockBatchWrite.mockResolvedValueOnce({})

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalledWith([{ id: 'demo-event-1' }, { id: 'demo-event-2' }])
    expect(mockResponse).toHaveBeenCalledWith(200, 'ok', event)
  })

  it('handles ServiceException errors', async () => {
    // Set environment to dev
    process.env.STAGE_NAME = 'dev'

    const event = { headers: {}, body: '' } as any
    const error = new ServiceException({
      name: 'TestServiceException',
      $fault: 'client',
      $metadata: {
        httpStatusCode: 400,
      },
    } as any)
    error.message = 'Service error'

    mockBatchWrite.mockRejectedValueOnce(error)

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(error)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Service error', event)
  })

  it('handles generic errors', async () => {
    // Set environment to dev
    process.env.STAGE_NAME = 'dev'

    const event = { headers: {}, body: '' } as any
    const error = new Error('Generic error')

    mockBatchWrite.mockRejectedValueOnce(error)

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(error)
    expect(mockResponse).toHaveBeenCalledWith(501, error, event)
  })

  it('handles ServiceException without httpStatusCode', async () => {
    // Set environment to dev
    process.env.STAGE_NAME = 'dev'

    const event = { headers: {}, body: '' } as any
    const error = new ServiceException({
      name: 'TestServiceException',
      $fault: 'client',
      $metadata: {},
    } as any)
    error.message = 'Service error without status'

    mockBatchWrite.mockRejectedValueOnce(error)

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(error)
    expect(mockResponse).toHaveBeenCalledWith(501, 'Service error without status', event)
  })
})
