import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetConfirmedEvent = jest.fn<any>()
const mockParsePostFile = jest.fn<any>()
const mockDeleteFile = jest.fn<any>()
const mockUploadFile = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
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

const { putInvitationAttachmentLambda } = await import('./handler')

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

    mockGetConfirmedEvent.mockResolvedValue({
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

    const result = await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
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

    const result = await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('event123')
    expect(result.statusCode).toBe(403)
    expect(mockParsePostFile).not.toHaveBeenCalled()
  })

  it('returns 400 if file parsing fails', async () => {
    mockParsePostFile.mockResolvedValueOnce({
      error: 'Invalid file format',
    })

    const result = await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('event123')
    expect(mockParsePostFile).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(400)
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

    const result = await putInvitationAttachmentLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('event123')
    expect(mockParsePostFile).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(400)
    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockUploadFile).not.toHaveBeenCalled()

    // Verify console.error was called with the expected message
    expect(console.error).toHaveBeenCalledWith('no data')
  })

  it('uploads new attachment and deletes old one', async () => {
    const result = await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('event123')

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
      },
      expect.any(String)
    )

    expect(result.statusCode).toBe(200)
  })

  it('uploads new attachment when no previous attachment exists', async () => {
    mockGetConfirmedEvent.mockResolvedValueOnce({
      id: 'event123',
      name: 'Test Event',
      organizer: {
        id: 'org789',
        name: 'Test Organizer',
      },
      // No invitationAttachment
    })

    const result = await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('event123')

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
      },
      expect.any(String)
    )

    expect(result.statusCode).toBe(200)
  })

  it('allows admin to upload attachment regardless of organizer', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: true,
      id: 'user123',
      name: 'Test User',
      roles: {},
    })

    const result = await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('event123')

    // Verify file was parsed
    expect(mockParsePostFile).toHaveBeenCalledWith(event)

    // Verify old attachment was deleted
    expect(mockDeleteFile).toHaveBeenCalledWith('old-attachment-key')

    // Verify new file was uploaded
    expect(mockUploadFile).toHaveBeenCalled()

    // Verify event was updated with new attachment key
    expect(mockUpdate).toHaveBeenCalled()

    expect(result.statusCode).toBe(200)
  })
})
