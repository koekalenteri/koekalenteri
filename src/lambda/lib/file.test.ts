import { vi } from 'vitest'

const mockSend = vi.fn()

vi.doMock('@aws-sdk/client-s3', () => ({
  CopyObjectCommand: vi.fn(function MockCopyObjectCommand(input) {
    return { input }
  }),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
  S3Client: vi.fn(function MockS3Client() {
    return { send: mockSend }
  }),
}))

const { copyFileToBucket } = await import('./file')

describe('copyFileToBucket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  it('copies the file to the same key in the other bucket (KOE-1471)', async () => {
    await copyFileToBucket('attachment-key', 'koekalenteri-test-event-attachments')

    expect(mockSend).toHaveBeenCalledWith({
      input: {
        Bucket: 'koekalenteri-test-event-attachments',
        CopySource: 'bucket-not-found-in-env/attachment-key',
        Key: 'attachment-key',
      },
    })
  })

  it('lets a failed copy fail', async () => {
    mockSend.mockRejectedValueOnce(new Error('AccessDenied'))

    await expect(copyFileToBucket('attachment-key', 'elsewhere')).rejects.toThrow('AccessDenied')
  })
})
