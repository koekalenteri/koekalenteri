import type { JsonEventType } from '../../types'

const mockEventTypes: JsonEventType[] = [
  {
    createdAt: '',
    createdBy: '',
    description: {
      en: 'TEST1 event type',
      fi: 'TEST1 tapahtymatyyppi',
      sv: 'TEST1 åå',
    },
    eventType: 'TEST1',
    modifiedAt: '',
    modifiedBy: '',
  },
]

export async function getEventTypes(
  _token: string,
  _refresh?: boolean,
  _signal?: AbortSignal
): Promise<JsonEventType[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockEventTypes))
  })
}
