import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetUsername = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockMarkdownToTemplate = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockWrite = jest.fn<any>()
const mockSend = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
  getUsername: mockGetUsername,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../utils/email/markdown', () => ({
  markdownToTemplate: mockMarkdownToTemplate,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    write: mockWrite,
  })),
}))

// Mock AWS SES client
jest.unstable_mockModule('@aws-sdk/client-ses', () => {
  // Create a mock SESServiceException base class
  class SESServiceException extends Error {
    $metadata: { httpStatusCode: number }

    constructor(options: { message: string; $metadata?: { httpStatusCode: number } }) {
      super(options.message)
      this.name = 'SESServiceException'
      this.$metadata = options.$metadata || { httpStatusCode: 400 }
    }
  }

  // Create the specific exception class
  class TemplateDoesNotExistException extends SESServiceException {
    constructor(options: { message?: string; $metadata?: { httpStatusCode: number } } = {}) {
      super({
        $metadata: options.$metadata || { httpStatusCode: 404 },
        message: options.message || 'Template does not exist',
      })
      this.name = 'TemplateDoesNotExistException'
    }
  }

  // Mock CONFIG
  jest.unstable_mockModule('../config', () => ({
    CONFIG: {
      emailTemplateTable: 'email-template-table',
      stackName: 'stack-name',
    },
  }))

  return {
    CreateTemplateCommand: jest.fn((params: any) => ({ ...params, command: 'CreateTemplateCommand' })),
    SESClient: jest.fn(() => ({
      send: mockSend,
    })),
    TemplateDoesNotExistException,
    UpdateTemplateCommand: jest.fn((params: any) => ({ ...params, command: 'UpdateTemplateCommand' })),
  }
})

// Mock setTimeout to avoid waiting in tests
jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
  callback()
  return {} as any
})

// Mock Date.toISOString to return a consistent timestamp for testing
const mockTimestamp = '2023-01-01T12:00:00.000Z'
const originalDateToISOString = Date.prototype.toISOString
beforeAll(() => {
  Date.prototype.toISOString = jest.fn(() => mockTimestamp)
})
afterAll(() => {
  Date.prototype.toISOString = originalDateToISOString
})

// Mock console methods
jest.spyOn(console, 'info').mockImplementation(() => {})
jest.spyOn(console, 'error').mockImplementation(() => {})

const { default: putEmailTemplateLambda } = await import('./handler')

describe('putEmailTemplateLambda', () => {
  const event = {
    body: JSON.stringify({
      en: '# English Template\n\nThis is a test template in English.',
      fi: '# Finnish Template\n\nThis is a test template in Finnish.',
      id: 'test-template',
      name: 'Test Template',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Admin User',
    })

    mockGetUsername.mockResolvedValue('Admin User')

    mockParseJSONWithFallback.mockReturnValue({
      en: '# English Template\n\nThis is a test template in English.',
      fi: '# Finnish Template\n\nThis is a test template in Finnish.',
      id: 'test-template',
      name: 'Test Template',
    })

    mockRead.mockResolvedValue(null) // No existing template by default

    mockMarkdownToTemplate.mockImplementation((templateName: string, _source: string) => {
      return Promise.resolve({
        HtmlPart: '<h1>Test HTML content</h1>',
        SubjectPart: 'Test Subject',
        TemplateName: templateName,
        TextPart: 'Test text content',
      })
    })

    mockSend.mockResolvedValue({})
    mockWrite.mockResolvedValue(undefined)
  })

  it('returns 401 if user is not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Regular User',
    })

    await putEmailTemplateLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockParseJSONWithFallback).not.toHaveBeenCalled()
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockMarkdownToTemplate).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('creates a new email template successfully', async () => {
    const fiTemplate = {
      HtmlPart: '<h1>Test HTML content</h1>',
      SubjectPart: 'Test Subject',
      TemplateName: 'test-template-stack-name-fi',
      TextPart: 'Test text content',
    }

    const enTemplate = {
      HtmlPart: '<h1>Test HTML content</h1>',
      SubjectPart: 'Test Subject',
      TemplateName: 'test-template-stack-name-en',
      TextPart: 'Test text content',
    }

    mockMarkdownToTemplate.mockResolvedValueOnce(enTemplate).mockResolvedValueOnce(fiTemplate)

    await putEmailTemplateLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetUsername).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)

    // Check if existing template was queried
    expect(mockRead).toHaveBeenCalledWith({ id: 'test-template' })

    // Check if markdown was converted to templates
    expect(mockMarkdownToTemplate).toHaveBeenCalledTimes(2)
    // We don't check the exact template name since it depends on CONFIG.stackName
    expect(mockMarkdownToTemplate).toHaveBeenCalledWith(
      expect.stringContaining('test-template'),
      '# Finnish Template\n\nThis is a test template in Finnish.'
    )
    expect(mockMarkdownToTemplate).toHaveBeenCalledWith(
      expect.stringContaining('test-template'),
      '# English Template\n\nThis is a test template in English.'
    )

    // Check if templates were sent to SES
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Check if data was written to DynamoDB
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        en: '# English Template\n\nThis is a test template in English.',
        fi: '# Finnish Template\n\nThis is a test template in Finnish.',
        id: 'test-template',
        modifiedAt: mockTimestamp,
        modifiedBy: 'Admin User',
        name: 'Test Template',
        ses: {
          en: enTemplate,
          fi: fiTemplate,
        },
      })
    )

    // Check if response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('updates an existing email template successfully', async () => {
    // Mock an existing template
    const existingTemplate = {
      createdAt: '2022-01-01T00:00:00.000Z',
      createdBy: 'Previous Admin',
      en: '# Old English Template',
      fi: '# Old Finnish Template',
      id: 'test-template',
      modifiedAt: '2022-01-01T00:00:00.000Z',
      modifiedBy: 'Previous Admin',
      name: 'Old Template Name',
    }

    mockRead.mockResolvedValueOnce(existingTemplate)

    const fiTemplate = {
      HtmlPart: '<h1>Test HTML content</h1>',
      SubjectPart: 'Test Subject',
      TemplateName: 'test-template-stack-name-fi',
      TextPart: 'Test text content',
    }

    const enTemplate = {
      HtmlPart: '<h1>Test HTML content</h1>',
      SubjectPart: 'Test Subject',
      TemplateName: 'test-template-stack-name-en',
      TextPart: 'Test text content',
    }

    mockMarkdownToTemplate.mockResolvedValueOnce(enTemplate).mockResolvedValueOnce(fiTemplate)

    await putEmailTemplateLambda(event)

    // Check if existing template was queried
    expect(mockRead).toHaveBeenCalledWith({ id: 'test-template' })

    // Check if data was written to DynamoDB with merged properties
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: '2022-01-01T00:00:00.000Z', // Preserved from existing
        createdBy: 'Previous Admin', // Preserved from existing
        en: '# English Template\n\nThis is a test template in English.', // Updated
        fi: '# Finnish Template\n\nThis is a test template in Finnish.', // Updated
        id: 'test-template',
        modifiedAt: mockTimestamp, // Updated
        modifiedBy: 'Admin User', // Updated
        name: 'Test Template', // Updated
        ses: {
          en: enTemplate,
          fi: fiTemplate,
        },
      })
    )

    // Check if response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('creates a new SES template when it does not exist', async () => {
    // Mock SES to throw TemplateDoesNotExistException on first call
    const { TemplateDoesNotExistException } = await import('@aws-sdk/client-ses')
    mockSend
      .mockRejectedValueOnce(
        new TemplateDoesNotExistException({
          $metadata: { httpStatusCode: 404 },
          message: 'Template does not exist',
        })
      )
      .mockResolvedValueOnce({}) // Second call succeeds
      .mockResolvedValueOnce({}) // Third call succeeds

    await putEmailTemplateLambda(event)

    // Check if SES was called 3 times (1 update attempt that fails, 1 create, 1 update for second template)
    expect(mockSend).toHaveBeenCalledTimes(3)
    expect(mockSend).toHaveBeenCalled()

    // Check if data was written to DynamoDB
    expect(mockWrite).toHaveBeenCalledWith(expect.any(Object))

    // Check if response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('throws an error if SES update fails with a non-TemplateDoesNotExistException error', async () => {
    const error = new Error('SES error')
    mockSend.mockRejectedValueOnce(error)

    await expect(putEmailTemplateLambda(event)).rejects.toThrow('SES error')

    // Check if SES was called
    expect(mockSend).toHaveBeenCalledTimes(1)

    // Check if data was not written to DynamoDB
    expect(mockWrite).not.toHaveBeenCalled()

    // Check if error was logged
    expect(console.error).toHaveBeenCalledWith(error)
  })

  it('throws an error if SES create fails', async () => {
    // Mock SES to throw TemplateDoesNotExistException on first call and error on second
    const { TemplateDoesNotExistException } = await import('@aws-sdk/client-ses')
    const error = new Error('SES create error') as Error
    mockSend
      .mockRejectedValueOnce(
        new TemplateDoesNotExistException({
          $metadata: { httpStatusCode: 404 },
          message: 'Template does not exist',
        })
      )
      .mockRejectedValueOnce(error)

    await expect(putEmailTemplateLambda(event)).rejects.toThrow('SES create error')

    // Check if SES was called twice (1 update attempt that fails, 1 create attempt that fails)
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Check if data was not written to DynamoDB
    expect(mockWrite).not.toHaveBeenCalled()

    // The error might be logged differently or not at all depending on the implementation
    // Just check that console.error was called
    expect(console.error).toHaveBeenCalled()
  })

  it('throws an error if DynamoDB write fails', async () => {
    const error = new Error('DynamoDB write error')
    mockWrite.mockRejectedValueOnce(error)

    await expect(putEmailTemplateLambda(event)).rejects.toThrow('DynamoDB write error')

    // Check if SES was called
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Check if write was attempted
    expect(mockWrite).toHaveBeenCalledTimes(1)

    // Check if response was not returned
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('throws an error if markdownToTemplate fails', async () => {
    const error = new Error('Markdown conversion error')
    mockMarkdownToTemplate.mockRejectedValueOnce(error)

    await expect(putEmailTemplateLambda(event)).rejects.toThrow('Markdown conversion error')

    // Check if markdownToTemplate was called
    expect(mockMarkdownToTemplate).toHaveBeenCalledTimes(1)

    // Check if SES was not called
    expect(mockSend).not.toHaveBeenCalled()

    // Check if data was not written to DynamoDB
    expect(mockWrite).not.toHaveBeenCalled()
  })
})
