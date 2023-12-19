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

export type EventTypeData = Omit<EventType, keyof DbRecord>

export type JsonEventType = EventTypeData & JsonDbRecord
