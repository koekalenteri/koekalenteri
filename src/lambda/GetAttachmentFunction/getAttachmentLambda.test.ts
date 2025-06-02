import { jest } from '@jest/globals'

const mockDownloadFile = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockLambdaError = jest.fn<any>()
const mockAllowOrigin = jest.fn<any>()

jest.unstable_mockModule('../lib/file', () => ({
  downloadFile: mockDownloadFile,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  LambdaError: mockLambdaError,
  allowOrigin: mockAllowOrigin,
}))

// Mock ReadableStream
class MockReadableStream {
  private data: Uint8Array
  private position = 0

  constructor(data: string) {
    this.data = new TextEncoder().encode(data)
  }

  getReader() {
    return {
      read: async () => {
        if (this.position >= this.data.length) {
          return { done: true, value: undefined }
        }
        const value = this.data.slice(this.position, this.position + 1)
        this.position += 1
        return { done: false, value }
      },
    }
  }
}

const { default: getAttachmentLambda } = await import('./handler')

describe('getAttachmentLambda', () => {
  const event = {
    headers: {},
    body: '',
    pathParameters: { key: 'test-file.pdf' },
    queryStringParameters: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockLambdaError.mockImplementation((code: number, message: string) => {
      const error = new Error(message) as Error & { statusCode: number }
      error.statusCode = code
      return error
    })
  })

  it('returns 404 when file is not found', async () => {
    const fileKey = 'nonexistent-file.pdf'
    mockGetParam.mockReturnValueOnce(fileKey)
    mockDownloadFile.mockResolvedValueOnce({ Body: null })

    await expect(getAttachmentLambda(event)).rejects.toEqual(
      expect.objectContaining({
        message: 'not found',
        statusCode: 404,
      })
    )

    expect(mockGetParam).toHaveBeenCalledWith(event, 'key')
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
  })

  it('returns file with inline disposition by default', async () => {
    const fileKey = 'test-file.pdf'
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
      statusCode: 200,
      body: expect.any(String), // Base64 encoded content
      isBase64Encoded: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('inline'),
      },
    })

    // Verify the content disposition header includes the filename
    expect(result.headers?.['Content-Disposition']).toContain(fileName)
  })

  it('returns file with attachment disposition when dl parameter is present', async () => {
    const fileKey = 'test-file.pdf'
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
      statusCode: 200,
      body: expect.any(String), // Base64 encoded content
      isBase64Encoded: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('attachment'),
      },
    })

    // Verify the content disposition header includes the filename
    expect(result.headers?.['Content-Disposition']).toContain(fileName)
  })

  it('sanitizes filename in Content-Disposition header', async () => {
    const fileKey = 'test-file.pdf'
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

  it('passes through errors from downloadFile', async () => {
    const fileKey = 'test-file.pdf'
    const error = new Error('S3 error')

    mockGetParam.mockReturnValueOnce(fileKey)
    mockDownloadFile.mockRejectedValueOnce(error)

    await expect(getAttachmentLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'key')
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey)
  })
})
