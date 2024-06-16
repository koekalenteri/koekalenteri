import type { DbRecord, JsonDbRecord } from './Database'
import type { ContactInfo } from './Event'

export type EmailTemplateId = 'registration' | 'receipt' | 'picked' | 'reserve' | 'invitation' | 'access' | 'refund'

export interface SESTemplate {
  TemplateName: string
  SubjectPart?: string
  TextPart?: string
  HtmlPart?: string
}

export interface EmailTemplate extends DbRecord {
  id: EmailTemplateId
  fi: string
  en: string
  ses?: {
    fi: SESTemplate
    en: SESTemplate
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
