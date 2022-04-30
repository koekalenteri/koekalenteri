import { Official } from "koekalenteri-shared/model";
import { makeAutoObservable, runInAction } from "mobx";
import { getOfficials } from "../api/official";
import { COfficial } from "./classes/COfficial";
import { RootStore } from "./RootStore";

export class OfficialStore {
  rootStore
  officials: Array<COfficial> = []
  loading = false

  constructor(rootStore: RootStore) {
    makeAutoObservable(this, {
      rootStore: false
    })
    this.rootStore = rootStore;
  }

  async load(refresh?: boolean, signal?: AbortSignal) {
    runInAction(() => {
      this.loading = true;
    });
    const data = await getOfficials(refresh, signal);
    runInAction(() => {
      data.forEach(json => this.updateOfficial(json));
      this.loading = false;
    });
  }

  getOfficials(ids?: number[]): COfficial[] {
    const result: COfficial[] = [];
    if (!ids || ids.length === 0) {
      return result;
    }
    for (const id of ids) {
      const judge = this.officials.find(item => item.id === id);
      if (judge) {
        result.push(judge);
      }
    }
    return result;
  }

  updateOfficial(json: Official) {
    let official = this.officials.find(o => o.id === json.id);
    if (!official) {
      official = new COfficial(this, json.id)
      this.officials.push(official)
    }
    official.updateFromJson(json)
  }
}


