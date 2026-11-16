import type { EmailTemplateId } from '../types'
import { exhaustiveStringTuple } from './typeGuards'

/**
 * Every template id the code knows, which the compiler keeps complete: the templates page pads the
 * list with them, and the defaults' rule test reads them (KOE-1363). A module of its own, without
 * Handlebars, because the admin state that pads the list loads with the main bundle.
 */
export const EMAIL_TEMPLATE_IDS = exhaustiveStringTuple<EmailTemplateId>()(
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
  'reserve'
)
