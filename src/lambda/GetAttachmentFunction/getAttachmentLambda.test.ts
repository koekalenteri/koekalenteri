import { jest } from '@jest/globals'

const mockDownloadFile = jest.fn<any>()

jest.unstable_mockModule('../lib/file', () => ({
  downloadFile: mockDownloadFile,
}))

// Mock Node.js Readable stream that implements async iterable
class MockReadableStream {
  private data: Uint8Array
  private buffer: Buffer

  constructor(data: string) {
    this.data = new TextEncoder().encode(data)
    this.buffer = Buffer.from(this.data)
  }

  // Implement async iterable protocol for compatibility with for-await-of
  async *[Symbol.asyncIterator]() {
    yield this.buffer
  }
}

const { getAttachmentLambda } = await import('./handler')

describe('getAttachmentLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { key: 'test-file.pdf' },
    queryStringParameters: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 when file is not found', async () => {
    const fileKey = 'nonexistent-file.pdf'
    const missingFileEvent = {
      ...event,
      pathParameters: { key: fileKey },
    }
    mockDownloadFile.mockResolvedValueOnce({ Body: null })

    await expect(getAttachmentLambda(missingFileEvent)).rejects.toThrow('404 not found')

    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
  })

  it('returns file with inline disposition by default', async () => {
    const fileKey = 'test-file.pdf'
    const fileName = 'test-file.pdf'
    const fileContent = 'PDF file content'
    const mockStream = new MockReadableStream(fileContent)

    mockDownloadFile.mockResolvedValueOnce({ Body: mockStream })
    const fileEvent = {
      ...event,
      headers: { origin: 'http://localhost:3000' },
      pathParameters: { key: fileKey, name: fileName },
    }

    const result = await getAttachmentLambda(fileEvent)

    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)

    expect(result).toEqual({
      body: expect.any(String), // Base64 encoded content
      headers: {
        'Access-Control-Allow-Origin': 'https://koekalenteri.snj.fi',
        'Content-Disposition': expect.stringContaining('inline'),
        'Content-Type': 'application/pdf',
      },
      isBase64Encoded: true,
      statusCode: 200,
    })

    // Verify the content disposition header includes the filename
    expect(result.headers?.['Content-Disposition']).toContain(fileName)
  })

  it('returns file with attachment disposition when dl parameter is present', async () => {
    const fileKey = 'test-file.pdf'
    const fileName = 'test-file.pdf'
    const fileContent = 'PDF file content'
    const mockStream = new MockReadableStream(fileContent)
    mockDownloadFile.mockResolvedValueOnce({ Body: mockStream })
    const eventWithDl = {
      ...event,
      headers: { origin: 'http://localhost:3000' },
      pathParameters: { key: fileKey, name: fileName },
      queryStringParameters: { dl: '' },
    }

    const result = await getAttachmentLambda(eventWithDl)

    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)

    expect(result).toEqual({
      body: expect.any(String), // Base64 encoded content
      headers: {
        'Access-Control-Allow-Origin': 'https://koekalenteri.snj.fi',
        'Content-Disposition': expect.stringContaining('attachment'),
        'Content-Type': 'application/pdf',
      },
      isBase64Encoded: true,
      statusCode: 200,
    })

    // Verify the content disposition header includes the filename
    expect(result.headers?.['Content-Disposition']).toContain(fileName)
  })

  it('sanitizes filename in Content-Disposition header', async () => {
    const fileKey = 'test-file.pdf'
    const fileName = 'test file with spaces & special chars.pdf'
    const fileContent = 'PDF file content'
    const mockStream = new MockReadableStream(fileContent)

    mockDownloadFile.mockResolvedValueOnce({ Body: mockStream })
    const fileEvent = {
      ...event,
      pathParameters: { key: fileKey, name: fileName },
    }

    const result = await getAttachmentLambda(fileEvent)

    // Verify the content disposition header includes both sanitized and encoded filenames
    const contentDisposition = result.headers?.['Content-Disposition']
    expect(contentDisposition).toContain('filename="testfilewithspacesspecialcharspdf"')
    expect(contentDisposition).toContain(`filename*=utf-8''${encodeURIComponent(fileName)}`)
  })

  it('passes through errors from downloadFile', async () => {
    const fileKey = 'test-file.pdf'
    const error = new Error('S3 error')

    const fileEvent = {
      ...event,
      pathParameters: { key: fileKey },
    }
    mockDownloadFile.mockRejectedValueOnce(error)

    await expect(getAttachmentLambda(fileEvent)).rejects.toThrow(error)

    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
  })
})
