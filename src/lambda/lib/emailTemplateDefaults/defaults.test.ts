import type { EmailTemplateId } from '../../../types'
import { findEmailTemplateError } from '../../../lib/emailTemplate'
import { EMAIL_TEMPLATE_IDS } from '../../../lib/emailTemplateIds'
import { EMAIL_TEMPLATE_DEFAULTS } from './defaults'

/**
 * The templates whose content lives only in each environment's table: they predate the defaults
 * (KOE-1363), and every environment already holds an edited row for them. Every other id needs a
 * Finnish and an English default, or a deploy leaves it empty. An id leaves this list when it gets
 * its defaults, and none ever joins it.
 */
const LEGACY_IDS: ReadonlySet<EmailTemplateId> = new Set<EmailTemplateId>([
  'access',
  'cancel-early',
  'cancel-picked',
  'cancel-reserve',
  'invitation',
  'message',
  'payment-request',
  'picked',
  'receipt',
  'refund',
  'registration',
  'reserve',
])

describe('email template defaults', () => {
  it('has a Finnish and an English default for every template id that is not legacy', () => {
    const missing = EMAIL_TEMPLATE_IDS.filter((id) => !LEGACY_IDS.has(id)).flatMap((id) =>
      (['fi', 'en'] as const)
        .filter((language) => !EMAIL_TEMPLATE_DEFAULTS[id]?.[language])
        .map((language) => `${id}.${language}`)
    )
    expect(missing).toEqual([])
  })

  it('holds only defaults the templates page would save', () => {
    const errors = EMAIL_TEMPLATE_IDS.flatMap((id) => {
      const source = EMAIL_TEMPLATE_DEFAULTS[id]
      const error = source && findEmailTemplateError(source)
      return error ? [{ error, id }] : []
    })
    expect(errors).toEqual([])
  })

  it('lists as legacy only the ids that have no default', () => {
    expect([...LEGACY_IDS].filter((id) => EMAIL_TEMPLATE_DEFAULTS[id])).toEqual([])
  })
})
