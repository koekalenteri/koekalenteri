import type { Template } from '@aws-sdk/client-ses'
import type { DbRecord, JsonDbRecord } from './Database'
import type { ContactInfo } from './Event'

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
    fi: Template
    en: Template
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
