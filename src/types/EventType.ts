import type { DbRecord, JsonDbRecord } from './Database'

export interface EventType extends DbRecord {
  eventType: string
  description: {
    fi: string
    en: string
    sv: string
  }
  active?: boolean
  official?: boolean
}

export type JsonEventType = Omit<EventType, keyof DbRecord> & JsonDbRecord
