import { DogStore } from "./DogStore";
import { EventTypeStore } from "./EventTypeStore";
import { JudgeStore } from "./JudgeStore";
import { OfficialStore } from "./OfficialStore";
import { OrganizerStore } from "./OrganizerStore";

export class RootStore {
  loading = false
  loaded = false
  dogStore
  eventTypeStore
  judgeStore
  officialStore
  organizerStore

  constructor() {
    this.dogStore = new DogStore(this);
    this.eventTypeStore = new EventTypeStore(this);
    this.judgeStore = new JudgeStore(this);
    this.officialStore = new OfficialStore(this);
    this.organizerStore = new OrganizerStore(this);
  }

  async load() {
    this.loading = true;
    await Promise.allSettled([
      this.eventTypeStore.load(),
      this.judgeStore.load(),
      this.officialStore.load(),
      this.organizerStore.load(),
    ]);
    this.loaded = true;
    this.loading = false;
  }
}
