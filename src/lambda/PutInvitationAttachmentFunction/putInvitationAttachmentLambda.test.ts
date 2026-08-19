import { vi } from 'vitest'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockGetParam = vi.fn()
const mockGetEvent = vi.fn()
const mockParsePostFile = vi.fn()
const mockDeleteFile = vi.fn()
const mockGetRegistrationsByEventId = vi.fn()
const mockUploadFile = vi.fn()
const mockUpdate = vi.fn()
const mockPublishAdminEventPatch = vi.fn()

vi.doMock('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/file', () => ({
  deleteFile: mockDeleteFile,
  parsePostFile: mockParsePostFile,
  uploadFile: mockUploadFile,
}))

vi.doMock('../lib/registration', () => ({
  getRegistrationsByEventId: mockGetRegistrationsByEventId,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(() => ({
    update: mockUpdate,
  })),
}))

vi.doMock('../lib/ws/actions', () => ({
  publishAdminEventPatch: mockPublishAdminEventPatch,
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
    vi.clearAllMocks()

    // Spy on console.error to prevent logs from being displayed
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test User',
      roles: {
        org789: 'admin',
      },
    })

    mockGetParam.mockImplementation((_event: unknown, name: string) => (name === 'eventId' ? 'event123' : ''))

    mockGetEvent.mockResolvedValue({
      id: 'event123',
      invitationAttachment: 'old-attachment-key',
      invitationAttachmentHistory: {
        'old-attachment-key': { uploadedAt: '2026-07-27T09:00:00.000Z' },
      },
      invitationAttachments: {
        AVO: 'old-avo-attachment-key',
      },
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
    mockGetRegistrationsByEventId.mockResolvedValue([
      { invitationAttachmentSent: 'old-attachment-key' },
      { invitationAttachmentRead: 'old-avo-attachment-key' },
    ])

    mockUploadFile.mockResolvedValue({})

    mockUpdate.mockResolvedValue({})

    // Mock nanoid to return a predictable value
    vi.spyOn(global.Math, 'random').mockReturnValue(0.123456789)
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('uploads new attachment and preserves the old one', async () => {
    await putInvitationAttachmentLambda(event)

    // Verify event was retrieved
    expect(mockGetEvent).toHaveBeenCalledWith('event123')

    // Verify file was parsed
    expect(mockParsePostFile).toHaveBeenCalledWith(event)

    // Previously sent invitation links must keep working.
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
        set: expect.objectContaining({
          invitationAttachment: expect.any(String),
          invitationAttachmentHistory: expect.any(Object),
        }),
      }
    )
    expect(mockPublishAdminEventPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event123',
        invitationAttachment: expect.any(String),
        invitationAttachmentHistory: expect.any(Object),
      }),
      'org789'
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event123' },
      expect.objectContaining({
        set: expect.objectContaining({
          invitationAttachment: expect.any(String),
          invitationAttachmentHistory: expect.objectContaining({
            'old-attachment-key': { uploadedAt: '2026-07-27T09:00:00.000Z' },
          }),
        }),
      })
    )

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        invitationAttachmentHistory: expect.any(Object),
        key: expect.any(String),
        uploadedAt: expect.any(String),
      }),
      event
    )
  })

  it('uploads class attachment and preserves the old class attachment', async () => {
    mockGetParam.mockImplementation((_event: unknown, name: string) =>
      name === 'eventId' ? 'event123' : name === 'className' ? 'AVO' : ''
    )

    await putInvitationAttachmentLambda(event)

    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockUploadFile).toHaveBeenCalledWith(expect.any(String), Buffer.from('test-file-content'))
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event123' },
      {
        set: expect.objectContaining({
          invitationAttachmentHistory: expect.any(Object),
          invitationAttachments: {
            AVO: expect.any(String),
          },
        }),
      }
    )
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        invitationAttachmentHistory: expect.any(Object),
        key: expect.any(String),
        uploadedAt: expect.any(String),
      }),
      event
    )
  })

  it('deletes an old attachment that has never been sent', async () => {
    mockGetRegistrationsByEventId.mockResolvedValueOnce([])

    await putInvitationAttachmentLambda(event)

    expect(mockDeleteFile).toHaveBeenCalledWith('old-attachment-key')
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'event123' },
      expect.objectContaining({
        set: expect.objectContaining({
          invitationAttachment: expect.any(String),
          invitationAttachmentHistory: expect.not.objectContaining({ 'old-attachment-key': expect.anything() }),
        }),
      })
    )
  })

  it('preserves an old attachment when a legacy invitation has no recorded attachment key', async () => {
    mockGetRegistrationsByEventId.mockResolvedValueOnce([{ invitationRead: true, messagesSent: { invitation: true } }])

    await putInvitationAttachmentLambda(event)

    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it('does not retain a class attachment for a legacy invitation in another class', async () => {
    mockGetParam.mockImplementation((_event: unknown, name: string) =>
      name === 'eventId' ? 'event123' : name === 'className' ? 'AVO' : ''
    )
    mockGetRegistrationsByEventId.mockResolvedValueOnce([
      { class: 'ALO', invitationRead: true, messagesSent: { invitation: true } },
    ])

    await putInvitationAttachmentLambda(event)

    expect(mockDeleteFile).toHaveBeenCalledWith('old-avo-attachment-key')
  })

  it('keeps the new attachment active if deleting the unused old file fails', async () => {
    const error = new Error('delete failed')
    mockGetRegistrationsByEventId.mockResolvedValueOnce([])
    mockDeleteFile.mockRejectedValueOnce(error)

    await putInvitationAttachmentLambda(event)

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockPublishAdminEventPatch).toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('Failed to delete unused invitation attachment', error)
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        invitationAttachmentHistory: expect.any(Object),
        key: expect.any(String),
        uploadedAt: expect.any(String),
      }),
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
        set: expect.objectContaining({
          invitationAttachment: expect.any(String),
          invitationAttachmentHistory: expect.any(Object),
        }),
      }
    )

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        invitationAttachmentHistory: expect.any(Object),
        key: expect.any(String),
        uploadedAt: expect.any(String),
      }),
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

    expect(mockDeleteFile).not.toHaveBeenCalled()

    // Verify new file was uploaded
    expect(mockUploadFile).toHaveBeenCalled()

    // Verify event was updated with new attachment key
    expect(mockUpdate).toHaveBeenCalled()

    // Verify response
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        invitationAttachmentHistory: expect.any(Object),
        key: expect.any(String),
        uploadedAt: expect.any(String),
      }),
      event
    )
  })
})
