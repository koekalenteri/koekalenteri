import { seedEmailTemplates } from '../lib/emailTemplate'
import { EMAIL_TEMPLATE_DEFAULTS } from '../lib/emailTemplateDefaults/defaults'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'

/**
 * Run by the deploy right after `sam deploy` (the `Seed email templates` step of release.yml), with
 * no API route: only IAM can invoke it. Writes the default of each template the table holds no row
 * for and never touches a row that is there (src/lambda/lib/emailTemplateDefaults/README.md,
 * KOE-1363). A default that could not be put in place answers 500, which fails the deploy step; the
 * next deploy tries it again, since no row was written for it.
 */
const seedEmailTemplatesLambda = lambda('seedEmailTemplates', async (event) => {
  const report = await seedEmailTemplates(EMAIL_TEMPLATE_DEFAULTS)

  if (report.failed.length) {
    logger.error('email template defaults not seeded', { failed: report.failed })
    return response(500, report, event)
  }
  logger.info('email template defaults seeded', { kept: report.kept, seeded: report.seeded })
  return response(200, report, event)
})

export default seedEmailTemplatesLambda
