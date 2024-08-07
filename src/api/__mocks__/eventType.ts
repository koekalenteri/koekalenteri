import type { JsonEventType } from '../../types'

const mockEventTypes: JsonEventType[] = [
  {
    createdAt: '',
    createdBy: '',
    modifiedAt: '',
    modifiedBy: '',
    eventType: 'TEST1',
    description: {
      fi: 'TEST1 tapahtymatyyppi',
      en: 'TEST1 event type',
      sv: 'TEST1 åå',
    },
  },
]

export async function getEventTypes(token: string, refresh?: boolean, signal?: AbortSignal): Promise<JsonEventType[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockEventTypes))
  })
}
