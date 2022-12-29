import { DogStore } from "./DogStore"

export class RootStore {
  loading = false
  loaded = false
  dogStore

  constructor() {
    this.dogStore = new DogStore(this)
  }

  async load(signal?: AbortSignal) {
    if (this.loading) {
      return
    }
    this.loading = true
    this.loaded = true
    this.loading = false
  }
}
