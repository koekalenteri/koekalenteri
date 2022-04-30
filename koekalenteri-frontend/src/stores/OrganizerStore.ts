import { Organizer } from "koekalenteri-shared/model";
import { makeAutoObservable, runInAction } from "mobx";
import { getOrganizers } from "../api/organizer";
import { COrganizer } from "./classes/COrganizer";
import { RootStore } from "./RootStore";

export class OrganizerStore {
  rootStore
  organizers: Array<COrganizer> = []
  loading = false

  constructor(rootStore: RootStore) {
    makeAutoObservable(this, {
      rootStore: false
    })
    this.rootStore = rootStore;
  }

  async load(refresh?: boolean, signal?: AbortSignal) {
    if (this.loading) {
      return;
    }
    runInAction(() => {
      this.loading = true;
    });
    const data = await getOrganizers(refresh, signal);
    runInAction(() => {
      data.forEach(json => this.updateOrganizer(json))
      this.loading = false;
    });
  }

  updateOrganizer(json: Organizer) {
    let organizer = this.organizers.find(o => o.id === json.id);
    if (!organizer) {
      organizer = new COrganizer(this, json.id)
      this.organizers.push(organizer)
    }
    organizer.updateFromJson(json)
  }
}


