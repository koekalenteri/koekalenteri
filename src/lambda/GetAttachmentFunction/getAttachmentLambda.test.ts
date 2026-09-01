import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockDownloadFile = vi.fn()
const mockGetParam = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockLambdaError = vi.fn()
const mockAllowOrigin = vi.fn()

vi.doMock('../lib/file', () => ({
  downloadFile: mockDownloadFile,
}))

vi.doMock('../lib/lambda', () => ({
  allowOrigin: mockAllowOrigin,
  getParam: mockGetParam,
  LambdaError: mockLambdaError,
  lambda: mockLambda,
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

const { default: getAttachmentLambda } = await import('./handler')

describe('getAttachmentLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    pathParameters: { key: 'test-file.pdf' },
    queryStringParameters: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockLambdaError.mockImplementation((code: number, message: string) => {
      const error = new Error(message) as Error & { statusCode: number }
      error.statusCode = code
      return error
    })
  })

  it('returns an understandable 404 when the file has no content', async () => {
    const fileKey = 'nonexistent-file-key1'
    mockGetParam.mockReturnValueOnce(fileKey)
    mockDownloadFile.mockResolvedValueOnce({ Body: null })
    mockAllowOrigin.mockReturnValueOnce('*')

    await expect(getAttachmentLambda(event)).resolves.toEqual({
      body: expect.stringContaining('Koekutsun liitetiedostoa ei enää löydy'),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      statusCode: 404,
    })

    expect(mockGetParam).toHaveBeenCalledWith(event, 'key')
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
  })

  it('returns an understandable 404 when S3 no longer contains the file', async () => {
    const fileKey = 'deleted-file-key1'
    mockGetParam.mockReturnValueOnce(fileKey)
    mockDownloadFile.mockRejectedValueOnce({
      $metadata: { httpStatusCode: 404 },
      message: 'The specified key does not exist.',
      name: 'NoSuchKey',
    })
    mockAllowOrigin.mockReturnValueOnce('*')

    await expect(getAttachmentLambda(event)).resolves.toEqual({
      body: 'Koekutsun liitetiedostoa ei enää löydy. Kokeen järjestäjä on saattanut päivittää tiedoston kutsun lähettämisen jälkeen. Pyydä tarvittaessa järjestäjältä uusi kutsu.',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      statusCode: 404,
    })
  })

  it('returns file with inline disposition by default', async () => {
    const fileKey = 'V1StGXR8_Z5jdHi6B-myT'
    const fileName = 'test-file.pdf'
    const fileContent = 'PDF file content'
    const mockStream = new MockReadableStream(fileContent)

    mockGetParam.mockReturnValueOnce(fileKey)
    mockGetParam.mockReturnValueOnce(fileName)
    mockDownloadFile.mockResolvedValueOnce({ Body: mockStream })
    mockAllowOrigin.mockReturnValueOnce('*')

    const result = await getAttachmentLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'key')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'name', 'kutsu.pdf')
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
    expect(mockAllowOrigin).toHaveBeenCalledWith(event)

    expect(result).toEqual({
      body: expect.any(String), // Base64 encoded content
      headers: {
        'Access-Control-Allow-Origin': '*',
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
    const fileKey = 'V1StGXR8_Z5jdHi6B-myT'
    const fileName = 'test-file.pdf'
    const fileContent = 'PDF file content'
    const mockStream = new MockReadableStream(fileContent)
    const eventWithDl = {
      ...event,
      queryStringParameters: { dl: '' },
    }

    mockGetParam.mockReturnValueOnce(fileKey)
    mockGetParam.mockReturnValueOnce(fileName)
    mockDownloadFile.mockResolvedValueOnce({ Body: mockStream })
    mockAllowOrigin.mockReturnValueOnce('*')

    const result = await getAttachmentLambda(eventWithDl)

    expect(mockGetParam).toHaveBeenCalledWith(eventWithDl, 'key')
    expect(mockGetParam).toHaveBeenCalledWith(eventWithDl, 'name', 'kutsu.pdf')
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
    expect(mockAllowOrigin).toHaveBeenCalledWith(eventWithDl)

    expect(result).toEqual({
      body: expect.any(String), // Base64 encoded content
      headers: {
        'Access-Control-Allow-Origin': '*',
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
    const fileKey = 'V1StGXR8_Z5jdHi6B-myT'
    const fileName = 'test file with spaces & special chars.pdf'
    const fileContent = 'PDF file content'
    const mockStream = new MockReadableStream(fileContent)

    mockGetParam.mockReturnValueOnce(fileKey)
    mockGetParam.mockReturnValueOnce(fileName)
    mockDownloadFile.mockResolvedValueOnce({ Body: mockStream })
    mockAllowOrigin.mockReturnValueOnce('*')

    const result = await getAttachmentLambda(event)

    // Verify the content disposition header includes both sanitized and encoded filenames
    const contentDisposition = result.headers?.['Content-Disposition']
    expect(contentDisposition).toContain('filename="testfilewithspacesspecialcharspdf"')
    expect(contentDisposition).toContain(`filename*=utf-8''${encodeURIComponent(fileName)}`)
  })

  it('returns 404 for a key that is not a valid attachment key, without hitting S3', async () => {
    mockGetParam.mockReturnValueOnce('some/other/object.txt')
    mockAllowOrigin.mockReturnValueOnce('*')

    await expect(getAttachmentLambda(event)).resolves.toMatchObject({ statusCode: 404 })

    expect(mockDownloadFile).not.toHaveBeenCalled()
  })

  it('passes through errors from downloadFile', async () => {
    const fileKey = 'V1StGXR8_Z5jdHi6B-myT'
    const error = new Error('S3 error')

    mockGetParam.mockReturnValueOnce(fileKey)
    mockDownloadFile.mockRejectedValueOnce(error)

    await expect(getAttachmentLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'key')
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
  })
})
