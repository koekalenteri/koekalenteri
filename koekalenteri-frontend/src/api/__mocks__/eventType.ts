import { EventType } from "koekalenteri-shared/model";

const mockEventTypes: EventType[] = [
  {
    eventType: 'TEST1', description: {
      fi: 'TEST1 tapahtymatyyppi',
      en: 'TEST1 event type',
      sv: 'TEST1 åå'
    }
  }
];

export async function getEventTypes(): Promise<EventType[]> {
  return new Promise((resolve) => {
    process.nextTick(() => resolve(mockEventTypes));
  });
}
