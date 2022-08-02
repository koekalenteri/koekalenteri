import { EventType } from "koekalenteri-shared/model";
import { makeAutoObservable, runInAction } from "mobx";
import { getEventTypes, putEventType } from "../api/eventType";
import { CEventType } from "./classes/CEventType";
import { RootStore } from "./RootStore";

export class EventTypeStore {
  rootStore
  eventTypes: Array<CEventType> = []
  loading = false

  constructor(rootStore: RootStore) {
    makeAutoObservable(this, {
      rootStore: false
    })
    this.rootStore = rootStore;
  }

  get activeEventTypes() {
    return this.eventTypes.filter(e => e.active);
  }

  async load(refresh?: boolean, signal?: AbortSignal) {
    if (this.loading) {
      return;
    }
    runInAction(() => {
      this.loading = true;
    });
    const data = await getEventTypes(refresh, signal);
    runInAction(() => {
      data.forEach(json => this.updateEventType(json))
      this.eventTypes.sort((a, b) => a.eventType.localeCompare(b.eventType));
      this.loading = false;
    });
  }

  async save(eventType: EventType) {
    try {
      runInAction(() => {
        this.loading = true;
      });
      const saved = await putEventType(eventType);
      runInAction(() => {
        this.updateEventType(saved);
        if (!eventType.active) {
          this.rootStore.judgeStore.load();
          this.rootStore.officialStore.load();
        }
        this.loading = false;
      });
    } catch (e) {
      console.error(e);
      this.loading = false;
    }
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


