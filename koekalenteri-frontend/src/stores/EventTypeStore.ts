import { EventType } from "koekalenteri-shared/model";
import { makeAutoObservable, runInAction } from "mobx";
import { getEventTypes } from "../api/eventType";
import { CEventType } from "./classes/CEventType";
import { RootStore } from "./RootStore";

export class EventTypeStore {
  rootStore
  eventTypes: Array<CEventType> = []
  loading = true

  constructor(rootStore: RootStore) {
    makeAutoObservable(this, {
      rootStore: false
    })
    this.rootStore = rootStore;
    this.load();
  }

  load(refresh?: boolean, signal?: AbortSignal) {
    this.loading = true;
    getEventTypes(refresh, signal).then(data => {
      runInAction(() => {
        data.forEach(json => this.updateEventType(json))
        this.loading = false;
      })
    })
  }

  updateEventType(json: EventType) {
    let eventType = this.eventTypes.find(o => o.eventType === json.eventType);
    if (!eventType) {
      eventType = new CEventType(this, json.eventType)
      this.eventTypes.push(eventType)
    }
    eventType.updateFromJson(json)
  }
}


