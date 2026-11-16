import type { SeedReport } from '../lib/emailTemplate'
import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockSeedEmailTemplates = vi.fn<() => Promise<SeedReport>>()

vi.doMock('../lib/emailTemplate', () => ({ seedEmailTemplates: mockSeedEmailTemplates }))

const { EMAIL_TEMPLATE_DEFAULTS } = await import('../lib/emailTemplateDefaults/defaults')
const { default: seedEmailTemplatesLambda } = await import('./handler')

/** What `aws lambda invoke --payload '{}'` hands the function: no API Gateway around it. */
const directInvoke = () => constructPartialAPIGwEvent({})

describe('seedEmailTemplatesLambda', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('seeds the repo defaults and answers 200 with the report', async () => {
    const report: SeedReport = { failed: [], kept: ['registration'], seeded: ['access'] }
    mockSeedEmailTemplates.mockResolvedValueOnce(report)

    const result = await seedEmailTemplatesLambda(directInvoke())

    expect(mockSeedEmailTemplates).toHaveBeenCalledWith(EMAIL_TEMPLATE_DEFAULTS)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(report)
  })

  it('answers 500 with the report when a default could not be put in place', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report: SeedReport = {
      failed: [{ id: 'access', language: 'fi', reason: 'Missing helper: "foo"' }],
      kept: [],
      seeded: ['refund'],
    }
    mockSeedEmailTemplates.mockResolvedValueOnce(report)

    const result = await seedEmailTemplatesLambda(directInvoke())

    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body)).toEqual(report)
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ failed: report.failed, message: 'email template defaults not seeded' }),
    ])
  })
})
