import type { DbRecord, JsonDbRecord } from './Database'
import type { ContactInfo } from './Event'
import type { Language } from './index'

/** SES-compatible template content, mirrored here so the shared types do not depend on @aws-sdk/client-ses. */
export interface EmailTemplateContent {
  HtmlPart?: string
  SubjectPart?: string
  TemplateName: string
  TextPart?: string
}

export type EmailTemplateId =
  | 'registration'
  | 'receipt'
  | 'picked'
  | 'reserve'
  | 'invitation'
  | 'message'
  | 'payment-request'
  | 'access'
  | 'refund'
  | 'cancel-early'
  | 'cancel-picked'
  | 'cancel-reserve'

export interface EmailTemplate extends DbRecord {
  id: EmailTemplateId
  fi: string
  en: string
  ses?: {
    fi: EmailTemplateContent
    en: EmailTemplateContent
  }
}

export type JsonEmailTemplate = Omit<EmailTemplate, keyof DbRecord> & JsonDbRecord

/**
 * Where Handlebars gave up on a template's source. `line` is 1-based. `column` and `endColumn`
 * are 0-based offsets on that line and present only when Handlebars reports them (a mismatched
 * block); a parse error names the line alone, and the lexer's caret is not to be trusted past a
 * line's first twenty characters.
 */
export interface TemplateSyntaxError {
  line: number
  column?: number
  endColumn?: number
  message: string
}

/**
 * Why a template could not be saved, as the editor shows it: the server answers a 400 with this
 * body, naming the language it stopped on, and the client builds the same shape for a failure it
 * found itself or one it could only name.
 */
export interface EmailTemplateError extends Partial<TemplateSyntaxError> {
  language?: Language
  message: string
}

export interface RegistrationMessage {
  template: EmailTemplateId
  eventId: string
  contactInfo: Partial<ContactInfo> | undefined
  registrationIds: string[]
  text: string
}

export interface JsonEmailSuppression {
  email: string
  eventId: string
  reason?: string
  registrationId: string
  status: 'bounce' | 'complaint'
  template?: EmailTemplateId
  updatedAt: string
}
