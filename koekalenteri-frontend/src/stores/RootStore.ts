import { DogStore } from "./DogStore"
import { EventTypeStore } from "./EventTypeStore"
import { JudgeStore } from "./JudgeStore"
import { OfficialStore } from "./OfficialStore"
import { OrganizerStore } from "./OrganizerStore"

export class RootStore {
  loading = false
  loaded = false
  dogStore
  eventTypeStore
  judgeStore
  officialStore
  organizerStore

  constructor() {
    this.dogStore = new DogStore(this)
    this.eventTypeStore = new EventTypeStore(this)
    this.judgeStore = new JudgeStore(this)
    this.officialStore = new OfficialStore(this)
    this.organizerStore = new OrganizerStore(this)
  }

  async load(signal?: AbortSignal) {
    if (this.loading) {
      return
    }
    this.loading = true
    await Promise.allSettled([
      this.eventTypeStore.load(false, signal),
      this.judgeStore.load(false, signal),
      this.officialStore.load(false, signal),
      this.organizerStore.load(false, signal),
    ])
    this.loaded = true
    this.loading = false
  }
}
