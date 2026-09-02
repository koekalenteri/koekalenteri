import type { DbRecord, JsonDbRecord } from './Database'
import type { ContactInfo } from './Event'

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
