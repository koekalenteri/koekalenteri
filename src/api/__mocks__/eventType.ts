import type { EventType, EventTypeData, JsonEventType } from '../../types'

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

export const getEventTypes = vi.fn(
  async (_token: string, _refresh?: boolean, _signal?: AbortSignal): Promise<JsonEventType[]> =>
    new Promise((resolve) => {
      process.nextTick(() => resolve(mockEventTypes))
    })
)

export const putEventType = vi.fn(
  async (eventType: EventTypeData, _token?: string, _signal?: AbortSignal): Promise<EventType> => ({
    createdAt: new Date(),
    createdBy: 'mock',
    modifiedAt: new Date(),
    modifiedBy: 'mock',
    ...eventType,
  })
)
