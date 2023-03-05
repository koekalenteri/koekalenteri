import { DbRecord, JsonDbRecord } from "./Database"

export type EmailTemplateId =  'registration' | 'reserve'

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
  registrationIds: string[]
  text: string
}
