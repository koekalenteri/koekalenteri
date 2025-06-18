import { jest } from '@jest/globals'
import { ServiceException } from '@smithy/smithy-client'

// Mock the events import
jest.unstable_mockModule('./demo-events', () => ({
  events: [{ id: 'demo-event-1' }, { id: 'demo-event-2' }],
}))

const mockResponse = jest.fn<any>()
const mockBatchWrite = jest.fn<any>()
const mockConfig = {
  stageName: 'dev',
  stackName: 'prod',
  eventTable: 'events-table',
}

jest.unstable_mockModule('../config', () => ({
  CONFIG: mockConfig,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  response: mockResponse,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    batchWrite: mockBatchWrite,
  })),
}))

const { default: demoEventsHandler } = await import('./handler')

describe('demoEvents', () => {
  let errorSpy: jest.SpiedFunction<any>

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks()

    // Reset config to default values
    Object.assign(mockConfig, {
      stageName: 'dev',
      stackName: 'prod',
      eventTable: 'events-table',
    })

    // Spy on console.error
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    // Restore console.error after each test
    errorSpy.mockRestore()
  })

  it('returns 401 when not in dev environment or local stack', async () => {
    // Set config to non-dev and non-local
    mockConfig.stageName = 'prod'
    mockConfig.stackName = 'prod'

    const event = { headers: {}, body: '' } as any

    await demoEventsHandler(event)

    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })

  it('successfully creates demo events in dev environment', async () => {
    // Set config to dev stage (default in beforeEach)
    mockConfig.stageName = 'dev'
    mockConfig.stackName = 'prod' // Any stack name should work with dev stage

    const event = { headers: {}, body: '' } as any
    mockBatchWrite.mockResolvedValueOnce({})

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalledWith([{ id: 'demo-event-1' }, { id: 'demo-event-2' }])
    expect(mockResponse).toHaveBeenCalledWith(200, 'ok', event)
  })

  it('successfully creates demo events in local stack environment', async () => {
    // Set config to local stack but non-dev stage
    mockConfig.stageName = 'prod'
    mockConfig.stackName = 'local'

    const event = { headers: {}, body: '' } as any
    mockBatchWrite.mockResolvedValueOnce({})

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalledWith([{ id: 'demo-event-1' }, { id: 'demo-event-2' }])
    expect(mockResponse).toHaveBeenCalledWith(200, 'ok', event)
  })

  it('handles ServiceException errors', async () => {
    // Config is already set to dev in beforeEach

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
    // Config is already set to dev in beforeEach

    const event = { headers: {}, body: '' } as any
    const error = new Error('Generic error')

    mockBatchWrite.mockRejectedValueOnce(error)

    await demoEventsHandler(event)

    expect(mockBatchWrite).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(error)
    expect(mockResponse).toHaveBeenCalledWith(501, error, event)
  })

  it('handles ServiceException without httpStatusCode', async () => {
    // Config is already set to dev in beforeEach

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
