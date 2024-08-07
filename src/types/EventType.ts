import type { DbRecord, JsonDbRecord } from './Database'

export interface EventType extends Omit<DbRecord, 'id'> {
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

export type JsonEventType = EventTypeData & Omit<JsonDbRecord, 'id'>
