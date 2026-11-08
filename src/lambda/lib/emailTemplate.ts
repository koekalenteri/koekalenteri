import type { EmailTemplateContent, EmailTemplateId, JsonEmailTemplate, Language } from '../../types'
import {
  CreateTemplateCommand,
  InvalidTemplateException,
  SESClient,
  TemplateDoesNotExistException,
  UpdateTemplateCommand,
} from '@aws-sdk/client-ses'
import { explainTemplateRejection, findEmailTemplateError } from '../../lib/emailTemplate'
import { EMAIL_TEMPLATE_IDS } from '../../lib/emailTemplateIds'
import { stageTitle } from '../../lib/env'
import { mapWithConcurrency } from '../../lib/utils'
import { CONFIG } from '../config'
import { markdownToTemplate } from '../utils/email/markdown'
import { httpError, LambdaError } from './lambda'
import { logger } from './log'
import { readEmailTemplates, writeNewEmailTemplate } from './repositories/emailTemplateRepository'
import { publishAdminDataInvalidation } from './ws/actions'

const ses = new SESClient()

/** A template's source in both languages, as the defaults hold it. */
export type EmailTemplateSource = Record<Language, string>

/** The default content of the templates that have one, by id (`emailTemplateDefaults/defaults.ts`). */
export type EmailTemplateDefaults = Partial<Record<EmailTemplateId, EmailTemplateSource>>

/**
 * SES refusing the template's content is the author's to fix, so it goes back as a 400 that names
 * the language. SES itself only says "Handlebars compilation failed for input Template Content";
 * compiling the parts here usually has a better word for it (KOE-1434). Anything else is ours and
 * is thrown on as it came.
 */
const rejection = (language: Language, template: EmailTemplateContent, e: unknown, message: string): unknown => {
  if (e instanceof InvalidTemplateException) {
    const explanation = explainTemplateRejection(template) ?? e.message
    logger.info('email template rejected by SES', { explanation, language, template: template.TemplateName })
    return httpError(400, { language, message: explanation })
  }
  logger.error(message, { error: e, template: template.TemplateName })
  return e
}

const updateOrCreateTemplate = async (language: Language, template: EmailTemplateContent) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await ses.send(new UpdateTemplateCommand({ Template: template }))
    logger.info('email template updated', { template: template.TemplateName })
  } catch (e) {
    if (!(e instanceof TemplateDoesNotExistException)) {
      throw rejection(language, template, e, 'failed to update email template')
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await ses.send(new CreateTemplateCommand({ Template: template }))
      logger.info('email template created', { template: template.TemplateName })
    } catch (createError) {
      throw rejection(language, template, createError, 'failed to create email template')
    }
  }
}

/**
 * The stack's own SES template from the markdown source. Outside prod the subject names the stage,
 * "(dev) Ilmoittautumisen vahvistus", so a tester's mailbox tells a dev mail from a prod mail the
 * way a tab title does (KOE-1671). A template saved before this keeps its subject until it is saved
 * again: SES renders the stored template, and sending cannot change the subject.
 */
const sesTemplate = async (id: string, language: Language, source: string): Promise<EmailTemplateContent> => {
  const template = await markdownToTemplate(`${id}-${CONFIG.stackName}-${language}`, source)
  return { ...template, SubjectPart: stageTitle(template.SubjectPart ?? '', CONFIG.stageName) }
}

/**
 * Checks both sources, then makes the template's SES copies, `<id>-<stack>-<language>`, the names a
 * send uses, and answers them for the row's `ses` field. Both sources are checked before either
 * reaches SES, so a broken English template never leaves the Finnish one updated there and the
 * table untouched. A source that does not parse, or one SES refuses, is a 400 naming the language.
 */
export const putSesTemplates = async (
  template: Pick<JsonEmailTemplate, 'id' | 'fi' | 'en'>
): Promise<NonNullable<JsonEmailTemplate['ses']>> => {
  const syntaxError = findEmailTemplateError(template)
  if (syntaxError) throw httpError(400, syntaxError)

  const result = {
    en: await sesTemplate(template.id, 'en', template.en),
    fi: await sesTemplate(template.id, 'fi', template.fi),
  }
  await updateOrCreateTemplate('fi', result.fi)
  await updateOrCreateTemplate('en', result.en)
  return result
}

/** A default the seeding could not put in place, and why, in words. */
export interface SeedFailure {
  id: EmailTemplateId
  language?: Language
  reason: string
}

export interface SeedReport {
  /** Defaults now in the table and in SES. */
  seeded: EmailTemplateId[]
  /** Defaults whose id already had a row, which stays as it is. */
  kept: EmailTemplateId[]
  failed: SeedFailure[]
}

const languageOf = (body: unknown): Language | undefined => {
  if (!body || typeof body !== 'object' || !('language' in body)) return undefined
  return body.language === 'fi' || body.language === 'en' ? body.language : undefined
}

/** The rejection in words: a 400 carries the language and the message, anything else its message. */
const seedFailure = (id: EmailTemplateId, error: unknown): SeedFailure => {
  if (error instanceof LambdaError) {
    return { id, language: languageOf(error.body), reason: error.error ?? error.message }
  }
  return { id, reason: error instanceof Error ? error.message : 'unknown error' }
}

/** Puts one default in place and records in the report how it went. */
const seedOne = async (report: SeedReport, id: EmailTemplateId, source: EmailTemplateSource, now: string) => {
  const row: JsonEmailTemplate = {
    createdAt: now,
    createdBy: 'system',
    en: source.en,
    fi: source.fi,
    id,
    modifiedAt: now,
    modifiedBy: 'system',
    updatedAt: now,
  }
  try {
    // SES first, as a save does: a failure there leaves no row, so the next deploy tries again.
    row.ses = await putSesTemplates(row)
  } catch (error) {
    report.failed.push(seedFailure(id, error))
    return
  }
  if (await writeNewEmailTemplate(row)) {
    report.seeded.push(id)
    return
  }
  logger.warn('email template saved while its default was seeded; the saved row stays', { id })
  report.kept.push(id)
}

/**
 * Puts each default whose id the table holds no row for into the table and SES, one at a time
 * (SES limits the template calls), and leaves every row the table holds as it is, whatever its
 * content: an organizer's edit is never replaced. Run by the deploy (KOE-1363). A default that fails
 * is reported and the others still run; one that is written bumps the templates' data version, so a
 * browser holding the list cached fetches it again instead of showing the empty placeholder.
 */
export const seedEmailTemplates = async (defaults: EmailTemplateDefaults): Promise<SeedReport> => {
  const stored = new Set((await readEmailTemplates())?.map(({ id }) => id))
  const report: SeedReport = { failed: [], kept: [], seeded: [] }
  const missing: [EmailTemplateId, EmailTemplateSource][] = []

  for (const id of EMAIL_TEMPLATE_IDS) {
    const source = defaults[id]
    if (!source) continue
    if (stored.has(id)) report.kept.push(id)
    else missing.push([id, source])
  }

  const now = new Date().toISOString()
  // One at a time, in order: SES limits the template calls (AGENTS.md, S9382: no await in a loop).
  await mapWithConcurrency(missing, 1, ([id, source]) => seedOne(report, id, source, now))

  if (report.seeded.length) await publishAdminDataInvalidation(['emailTemplates'])
  return report
}
