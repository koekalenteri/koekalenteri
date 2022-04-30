import { EventType } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { EventTypeStore } from "../EventTypeStore";

export class CEventType {
  description?: { fi: string; en: string; sv: string; };
  eventType: string;
  search = ""
  store: EventTypeStore;

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
    // TODO: use selected langauge
    this.search = [json.eventType, json.description.fi].map(v => v.toLocaleLowerCase()).join(' ');
  }
}
