import { EventType } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { EventTypeStore } from "../EventTypeStore";

export class CEventType {
  active?: boolean;
  description: { fi: string; en: string; sv: string; } = { fi: '', en: '', sv: '' };
  eventType: string;
  official?: boolean;
  search = ''
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
    this.official = json.official;

    this.active = json.active;

    // TODO: use selected langauge
    this.search = [json.eventType, json.description.fi].map(v => v.toLocaleLowerCase()).join(' ');
  }

  toJSON(): EventType {
    return {
      active: this.active,
      description: this.description,
      eventType: this.eventType,
      official: this.official,
    }
  }
}
