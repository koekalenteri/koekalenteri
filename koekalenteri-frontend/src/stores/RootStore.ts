import { EventTypeStore } from "./EventTypeStore";
import { JudgeStore } from "./JudgeStore";
import { OrganizerStore } from "./OrganizerStore";

export class RootStore {
  eventTypeStore
  judgeStore
  organizerStore

  constructor() {
    this.eventTypeStore = new EventTypeStore(this);
    this.judgeStore = new JudgeStore(this);
    this.organizerStore = new OrganizerStore(this);
  }
}
