import type { EmailTemplateContent, JsonEmailTemplate } from '../../types'
import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

const mockReadEmailTemplates = vi.fn<() => Promise<JsonEmailTemplate[] | undefined>>()
const mockWriteNewEmailTemplate = vi.fn<(template: JsonEmailTemplate) => Promise<boolean>>()
const mockPublishAdminDataInvalidation = vi.fn()
const mockSend = vi.fn()

vi.doMock('../config', () => ({ CONFIG: { stackName: 'stack', stageName: 'dev' } }))
vi.doMock('./repositories/emailTemplateRepository', () => ({
  readEmailTemplates: mockReadEmailTemplates,
  writeEmailTemplate: vi.fn(),
  writeNewEmailTemplate: mockWriteNewEmailTemplate,
}))
vi.doMock('./ws/actions', () => ({ publishAdminDataInvalidation: mockPublishAdminDataInvalidation }))

// SES is the boundary: the commands carry their input, and send answers what a test tells it to.
vi.doMock('@aws-sdk/client-ses', () => {
  // The SDK's exceptions take their message in an options object.
  class SESException extends Error {
    constructor(options: { message: string }) {
      super(options.message)
    }
  }
  class TemplateDoesNotExistException extends SESException {
    name = 'TemplateDoesNotExistException'
  }
  class InvalidTemplateException extends SESException {
    name = 'InvalidTemplateException'
  }
  const command = (name: string) =>
    vi.fn(function MockCommand(input: { Template: EmailTemplateContent }) {
      return { command: name, input }
    })
  return {
    CreateTemplateCommand: command('CreateTemplate'),
    InvalidTemplateException,
    SESClient: vi.fn(function MockSESClient() {
      return { send: mockSend }
    }),
    TemplateDoesNotExistException,
    UpdateTemplateCommand: command('UpdateTemplate'),
  }
})

const ses = await import('@aws-sdk/client-ses')
const { seedEmailTemplates } = await import('./emailTemplate')

const NOW = '2026-11-08T10:00:00.000Z'

const stored = (id: JsonEmailTemplate['id']): JsonEmailTemplate => ({
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'someone',
  en: '# Edited\n\nby an organizer',
  fi: '# Muokattu\n\njärjestäjän tekstiä',
  id,
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'someone',
})

const fixtureDefault = {
  en: '[subject]: # (Hello {{reg.handler.name}})\n\nWelcome',
  fi: '[subject]: # (Hei {{reg.handler.name}})\n\nTervetuloa',
}

/** The SES calls the run made, as "<command> <template name>", in order; filled in by the send mock. */
const sesCalls: string[] = []

/** Runs the seeding to the end, through the pause it keeps between SES calls. */
const seed = async (...args: Parameters<typeof seedEmailTemplates>) => {
  const run = seedEmailTemplates(...args)
  await vi.runAllTimersAsync()
  return run
}

describe('seedEmailTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date(NOW) })
    mockReadEmailTemplates.mockResolvedValue([stored('registration')])
    mockWriteNewEmailTemplate.mockResolvedValue(true)
    sesCalls.length = 0
    // A new id has no SES template yet: the update is refused and the template is created.
    mockSend.mockImplementation(async (sent: { command: string; input: { Template: EmailTemplateContent } }) => {
      sesCalls.push(`${sent.command} ${sent.input.Template.TemplateName}`)
      if (sent.command === 'UpdateTemplate') throw new ses.TemplateDoesNotExistException({ $metadata: {}, message: '' })
      return {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('writes the row and creates both SES templates of a default whose id has no row', async () => {
    const report = await seed({ access: fixtureDefault })

    expect(sesCalls).toEqual([
      'UpdateTemplate access-stack-fi',
      'CreateTemplate access-stack-fi',
      'UpdateTemplate access-stack-en',
      'CreateTemplate access-stack-en',
    ])
    expect(mockWriteNewEmailTemplate).toHaveBeenCalledTimes(1)
    expect(mockWriteNewEmailTemplate).toHaveBeenCalledWith({
      createdAt: NOW,
      createdBy: 'system',
      en: fixtureDefault.en,
      fi: fixtureDefault.fi,
      id: 'access',
      modifiedAt: NOW,
      modifiedBy: 'system',
      ses: {
        en: expect.objectContaining({
          SubjectPart: '(dev) Hello {{reg.handler.name}}',
          TemplateName: 'access-stack-en',
        }),
        fi: expect.objectContaining({ SubjectPart: '(dev) Hei {{reg.handler.name}}', TemplateName: 'access-stack-fi' }),
      },
      updatedAt: NOW,
    })
    expect(mockPublishAdminDataInvalidation).toHaveBeenCalledTimes(1)
    expect(mockPublishAdminDataInvalidation).toHaveBeenCalledWith(['emailTemplates'])
    expect(report).toEqual({ failed: [], kept: [], seeded: ['access'] })
  })

  it('never touches a row the table holds, whatever its content', async () => {
    const report = await seed({ registration: fixtureDefault })

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockWriteNewEmailTemplate).not.toHaveBeenCalled()
    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
    expect(report).toEqual({ failed: [], kept: ['registration'], seeded: [] })
  })

  it('keeps a row an organizer saved between the read and the write', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockWriteNewEmailTemplate.mockResolvedValueOnce(false)

    const report = await seed({ access: fixtureDefault })

    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
    expect(loggedLines(warnSpy)).toEqual([
      expect.objectContaining({
        id: 'access',
        message: 'email template saved while its default was seeded; the saved row stays',
      }),
    ])
    expect(report).toEqual({ failed: [], kept: ['access'], seeded: [] })
  })

  it('does nothing without defaults', async () => {
    const report = await seed({})

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
    expect(report).toEqual({ failed: [], kept: [], seeded: [] })
  })

  it('reads an empty table as no rows', async () => {
    mockReadEmailTemplates.mockResolvedValueOnce(undefined)

    const report = await seed({ registration: fixtureDefault })

    expect(report).toEqual({ failed: [], kept: [], seeded: ['registration'] })
  })

  it('refuses a default that does not compile before SES sees it, and seeds the others', async () => {
    const report = await seed({
      access: { ...fixtureDefault, en: '# Hello {{#if x}}\n\nnever closed' },
      refund: fixtureDefault,
    })

    expect(sesCalls.filter((call) => call.includes('access'))).toEqual([])
    expect(mockWriteNewEmailTemplate).toHaveBeenCalledTimes(1)
    expect(mockWriteNewEmailTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'refund' }))
    expect(report).toEqual({
      failed: [{ id: 'access', language: 'en', reason: 'The template ends before a {{ }} or a block is closed' }],
      kept: [],
      seeded: ['refund'],
    })
  })

  it('writes no row for a default SES refuses, so the next deploy tries it again', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    mockSend.mockRejectedValue(new ses.InvalidTemplateException({ $metadata: {}, message: 'refused' }))

    const report = await seed({ access: fixtureDefault })

    expect(mockWriteNewEmailTemplate).not.toHaveBeenCalled()
    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
    expect(report).toEqual({
      failed: [{ id: 'access', language: 'fi', reason: 'refused' }],
      kept: [],
      seeded: [],
    })
  })

  it.each([
    ['an error', new Error('Rate exceeded'), 'Rate exceeded'],
    ['anything else', 'Rate exceeded', 'unknown error'],
  ])('reports an SES failure that is not a refusal, %s, by its message', async (_kind, failure, reason) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockRejectedValue(failure)

    const report = await seed({ access: fixtureDefault })

    expect(mockWriteNewEmailTemplate).not.toHaveBeenCalled()
    expect(loggedLines(errorSpy)).toEqual([expect.objectContaining({ message: 'failed to update email template' })])
    expect(report).toEqual({ failed: [{ id: 'access', reason }], kept: [], seeded: [] })
  })
})
