import type { JsonRegistration } from '../../types'
import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockSaveAdminRegistration = jest.fn<any>()

const mockDynamoDB = {
  batchWrite: jest.fn<any>(),
  delete: jest.fn<any>(),
  query: jest.fn<any>(),
  read: jest.fn<any>(),
  readAll: jest.fn<any>(),
  update: jest.fn<any>(),
  write: jest.fn<any>(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

const libEmail = await import('../lib/email')

jest.unstable_mockModule('../lib/email', () => ({
  ...libEmail,
  sendTemplatedMail: mockSendTemplatedMail,
}))

jest.unstable_mockModule('../registration/actions', () => ({
  saveAdminRegistration: mockSaveAdminRegistration,
}))

const { default: putAdminRegistrationLambda } = await import('./handler')

describe('putAdminRegistrationLambda', () => {
  const confirmedEvent = {
    classes: [{ class: 'ALO', entries: 10 }],
    endDate: '2024-01-02',
    id: 'event123',
    name: 'Test Event',
    startDate: '2024-01-01',
  }

  const savedRegistration: JsonRegistration = {
    agreeToTerms: true,
    breeder: { name: '' },
    class: 'ALO',
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: 'Test User',
    dates: [],
    dog: {
      breedCode: '111',
      regNo: 'DOG123',
    },
    eventId: 'event123',
    eventType: 'test',
    handler: {
      email: 'handler@example.com',
      membership: false,
      name: '',
    },
    id: 'reg456',
    language: 'fi',
    modifiedAt: '2024-01-01T00:00:00.000Z',
    modifiedBy: 'Test User',
    notes: '',
    owner: {
      email: 'owner@example.com',
      membership: false,
      name: '',
    },
    qualifyingResults: [],
    reserve: 'ANY',
    state: 'ready',
  }

  const event = {
    body: JSON.stringify({
      class: 'ALO',
      dates: [],
      dog: {
        breedCode: '111',
        regNo: 'DOG123',
      },
      eventId: 'event123',
      handler: {
        email: 'handler@example.com',
      },
      id: 'reg456',
      language: 'fi',
      owner: {
        email: 'owner@example.com',
      },
      qualifyingResults: [],
      reserve: 'ANY',
    }),
    headers: {},
    requestContext: {
      requestId: 'test-request-id',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
    })

    // Default: successful save (update path)
    mockSaveAdminRegistration.mockResolvedValue({
      confirmedEvent,
      data: savedRegistration,
      existing: {
        eventId: 'event123',
        id: 'reg456',
        state: 'draft',
      },
      kind: 'saved',
    })

    mockSendTemplatedMail.mockResolvedValue(undefined)

    // Mock DynamoDB responses for audit writes
    mockDynamoDB.read.mockResolvedValue(confirmedEvent)
    mockDynamoDB.write.mockResolvedValue(undefined)
    mockDynamoDB.update.mockResolvedValue(undefined)

    jest.spyOn(console, 'debug').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await putAdminRegistrationLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockSaveAdminRegistration).not.toHaveBeenCalled()
  })

  it('returns 409 if dog is already registered to the event', async () => {
    const newEvent = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
        // No id — new registration
      }),
    }

    mockSaveAdminRegistration.mockResolvedValueOnce({
      cancelled: false,
      kind: 'already-registered',
    })

    const result = await putAdminRegistrationLambda(newEvent)

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      cancelled: false,
      message: 'Conflict: Dog already registered to this event',
    })
  })

  it('returns 409 with cancelled=true when existing registration is cancelled', async () => {
    const newEvent = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    mockSaveAdminRegistration.mockResolvedValueOnce({
      cancelled: true,
      kind: 'already-registered',
    })

    const result = await putAdminRegistrationLambda(newEvent)

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      cancelled: true,
      message: 'Conflict: Dog already registered to this event',
    })
  })

  it('creates a new registration and sends email', async () => {
    const newEvent = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {
          email: 'handler@example.com',
        },
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
        // No id — new registration
      }),
    }

    const newReg = { ...savedRegistration, id: 'newid123' }
    mockSaveAdminRegistration.mockResolvedValueOnce({
      confirmedEvent,
      data: newReg,
      existing: undefined, // no existing → create
      kind: 'saved',
    })

    const result = await putAdminRegistrationLambda(newEvent)

    expect(result.statusCode).toBe(200)
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('creates a new registration without sending email when handler email is missing', async () => {
    const newEvent = {
      ...event,
      body: JSON.stringify({
        class: 'ALO',
        dates: [],
        dog: {
          breedCode: '111',
          regNo: 'DOG123',
        },
        eventId: 'event123',
        handler: {}, // No email
        language: 'fi',
        owner: {
          email: 'owner@example.com',
        },
        qualifyingResults: [],
        reserve: 'ANY',
      }),
    }

    const newReg = { ...savedRegistration, handler: { membership: false, name: '' } }
    mockSaveAdminRegistration.mockResolvedValueOnce({
      confirmedEvent,
      data: newReg,
      existing: undefined,
      kind: 'saved',
    })

    const result = await putAdminRegistrationLambda(newEvent)

    expect(result.statusCode).toBe(200)
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()
  })

  it('updates an existing registration and sends email', async () => {
    const result = await putAdminRegistrationLambda(event)

    expect(result.statusCode).toBe(200)
    expect(mockSaveAdminRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'Test User',
      })
    )
    // Email sent for update since handler.email and owner.email exist on the request body
    expect(mockSendTemplatedMail).toHaveBeenCalled()
  })
})
