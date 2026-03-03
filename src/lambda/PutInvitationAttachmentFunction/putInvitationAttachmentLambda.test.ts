import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockParsePostFile = jest.fn<any>()
const mockDeleteFile = jest.fn<any>()
const mockUploadFile = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../lib/file', () => ({
  deleteFile: mockDeleteFile,
  parsePostFile: mockParsePostFile,
  uploadFile: mockUploadFile,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    update: mockUpdate,
  })),
}))

const { default: putInvitationAttachmentLambda } = await import('./handler')

describe('putInvitationAttachmentLambda', () => {
  const event = {
    body: 'file-content-base64',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=boundary',
    },
    pathParameters: {
      eventId: 'event123',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Spy on console.error to prevent logs from being displayed
    jest.spyOn(console, 'error').mockImplementation(() => {})

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
      roles: {
        org789: 'admin',
      },
    })

    mockGetParam.mockReturnValue('event123')

    mockGetEvent.mockResolvedValue({
      id: 'event123',
      invitationAttachment: 'old-attachment-key',
      name: 'Test Event',
      organizer: {
        id: 'org789',
        name: 'Test Organizer',
      },
    })

    mockParsePostFile.mockResolvedValue({
      contentType: 'application/pdf',
      data: Buffer.from('test-file-content'),
      filename: 'test.pdf',
    })

    mockDeleteFile.mockResolvedValue({})

    mockUploadFile.mockResolvedValue({})

    mockUpdate.mockResolvedValue({})

    // Mock nanoid to return a predictable value
    jest.spyOn(global.Math, 'random').mockReturnValue(0.123456789)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockParsePostFile).not.toHaveBeenCalled()
  })

  it('returns 403 if not admin or organizer role', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test User',
      roles: {
        other_org: 'admin', // Different organizer
      },
    })

    await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockParsePostFile).not.toHaveBeenCalled()
  })

  it('returns 400 if file parsing fails', async () => {
    mockParsePostFile.mockResolvedValueOnce({
      error: 'Invalid file format',
    })

    await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockParsePostFile).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Invalid file format', event)
    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockUploadFile).not.toHaveBeenCalled()

    // Verify console.error was called with the expected message
    expect(console.error).toHaveBeenCalledWith('Invalid file format')
  })

  it('returns 400 if no file data', async () => {
    mockParsePostFile.mockResolvedValueOnce({
      contentType: 'application/pdf',
      data: null,
      filename: 'test.pdf',
    })

    await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetEvent).toHaveBeenCalledWith('event123')
    expect(mockParsePostFile).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'no data', event)
    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockUploadFile).not.toHaveBeenCalled()

    // Verify console.error was called with the expected message
    expect(console.error).toHaveBeenCalledWith('no data')
  })

  it('uploads new attachment and deletes old one', async () => {
    await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetEvent).toHaveBeenCalledWith('event123')

    // Verify file was parsed
    expect(mockParsePostFile).toHaveBeenCalledWith(event)

    // Verify old attachment was deleted
    expect(mockDeleteFile).toHaveBeenCalledWith('old-attachment-key')

    // Verify new file was uploaded
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.any(String), // nanoid generated key
      Buffer.from('test-file-content')
    )

    // Verify event was updated with new attachment key
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event123' },
      {
        set: {
          invitationAttachment: expect.any(String),
        },
      }
    )

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.any(String), // nanoid generated key
      event
    )
  })

  it('uploads new attachment when no previous attachment exists', async () => {
    mockGetEvent.mockResolvedValueOnce({
      id: 'event123',
      name: 'Test Event',
      organizer: {
        id: 'org789',
        name: 'Test Organizer',
      },
      // No invitationAttachment
    })

    await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetEvent).toHaveBeenCalledWith('event123')

    // Verify file was parsed
    expect(mockParsePostFile).toHaveBeenCalledWith(event)

    // Verify no attachment was deleted
    expect(mockDeleteFile).not.toHaveBeenCalled()

    // Verify new file was uploaded
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.any(String), // nanoid generated key
      Buffer.from('test-file-content')
    )

    // Verify event was updated with new attachment key
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event123' },
      {
        set: {
          invitationAttachment: expect.any(String),
        },
      }
    )

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.any(String), // nanoid generated key
      event
    )
  })

  it('allows admin to upload attachment regardless of organizer', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: true,
      id: 'user123',
      name: 'Test User',
      roles: {},
    })

    await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetEvent).toHaveBeenCalledWith('event123')

    // Verify file was parsed
    expect(mockParsePostFile).toHaveBeenCalledWith(event)

    // Verify old attachment was deleted
    expect(mockDeleteFile).toHaveBeenCalledWith('old-attachment-key')

    // Verify new file was uploaded
    expect(mockUploadFile).toHaveBeenCalled()

    // Verify event was updated with new attachment key
    expect(mockUpdate).toHaveBeenCalled()

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(String), event)
  })
})
