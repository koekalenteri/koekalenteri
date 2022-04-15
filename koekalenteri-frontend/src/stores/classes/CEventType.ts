import { EventType } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { EventTypeStore } from "../EventTypeStore";


export class CEventType {
  store: EventTypeStore;
  eventType: string;
  description?: { fi: string; en: string; sv: string; };

  constructor(store: EventTypeStore, eventType: string) {
    makeAutoObservable(this, {
      eventType: false,
      store: false,
    });
    this.store = store;
    this.eventType = eventType;
  }

  updateFromJson(json: EventType) {
    this.description = json.description;
  }
}
