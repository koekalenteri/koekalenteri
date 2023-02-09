import { DbRecord, JsonDbRecord } from "./Database"

export type EmailTemplateId = 'registration'

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
