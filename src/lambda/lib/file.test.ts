import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

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

const { copyFileToBucket, parsePostFile } = await import('./file')

const MB = 1024 * 1024
const BOUNDARY = 'test-boundary'
const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`

const filePart = (content: Buffer, name = 'file') =>
  Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    ),
    content,
    Buffer.from('\r\n'),
  ])

const fieldPart = (name: string, value: string) =>
  Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)

const multipartBody = (...parts: Buffer[]) => Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`)])

/** A body as API Gateway hands it over: multipart/form-data is a binary media type, so base64. */
const postEvent = (body: Buffer) =>
  constructPartialAPIGwEvent({
    body: body.toString('base64'),
    headers: { 'Content-Type': CONTENT_TYPE },
    isBase64Encoded: true,
  })

describe('parsePostFile', () => {
  it('reads the one file of a body', async () => {
    const content = Buffer.from('%PDF-1.7 content')

    const result = await parsePostFile(postEvent(multipartBody(filePart(content))))

    expect(result.data).toEqual(content)
    expect(result.info).toEqual(expect.objectContaining({ filename: 'file.pdf', mimeType: 'application/pdf' }))
    expect(result.error).toBeNull()
    expect(result.rejection).toBeUndefined()
  })

  it('reads a body that is not base64 encoded, with the header in lower case', async () => {
    const content = Buffer.from('%PDF-1.7 content')

    const result = await parsePostFile(
      constructPartialAPIGwEvent({
        body: multipartBody(filePart(content)).toString('binary'),
        headers: { 'content-type': CONTENT_TYPE },
        isBase64Encoded: false,
      })
    )

    expect(result.data).toEqual(content)
    expect(result.rejection).toBeUndefined()
  })

  it('accepts a file of exactly 5 MB', async () => {
    const content = Buffer.alloc(5 * MB, 'a')

    const result = await parsePostFile(postEvent(multipartBody(filePart(content))))

    expect(result.rejection).toBeUndefined()
    expect(result.data).toHaveLength(5 * MB)
  })

  it('refuses a file over 5 MB and hands no part of it on', async () => {
    const content = Buffer.alloc(5 * MB + 1, 'a')

    const result = await parsePostFile(postEvent(multipartBody(filePart(content))))

    expect(result.rejection).toBe('tooLarge')
    expect(result.data).toBeUndefined()
  })

  it('refuses a second file part and hands neither on', async () => {
    const body = multipartBody(filePart(Buffer.from('%PDF-first')), filePart(Buffer.from('%PDF-second'), 'other'))

    const result = await parsePostFile(postEvent(body))

    expect(result.rejection).toBe('tooManyFiles')
    expect(result.data).toBeUndefined()
  })

  it('ignores a form field', async () => {
    const content = Buffer.from('%PDF-1.7 content')

    const result = await parsePostFile(postEvent(multipartBody(fieldPart('note', 'hello'), filePart(content))))

    expect(result.data).toEqual(content)
    expect(result.rejection).toBeUndefined()
  })

  it('has no data for a body without a file', async () => {
    const result = await parsePostFile(postEvent(multipartBody()))

    expect(result.data).toBeUndefined()
    expect(result.rejection).toBeUndefined()
  })

  it('rejects a body cut off inside the file, without an uncaught stream error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cut = filePart(Buffer.from('%PDF-1.7 content'))

    await expect(parsePostFile(postEvent(cut))).rejects.toThrow('bb error')

    errorSpy.mockRestore()
  })

  it('rejects a body that ends before the form does', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(parsePostFile(postEvent(Buffer.from(`--${BOUNDARY}\r\n`)))).rejects.toThrow('bb error')

    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({ message: 'busboy failed to parse the request' })
    )
    errorSpy.mockRestore()
  })
})

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
