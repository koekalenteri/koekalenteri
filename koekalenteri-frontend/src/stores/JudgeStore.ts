import { Judge } from "koekalenteri-shared/model";
import { makeAutoObservable, runInAction } from "mobx";
import { getJudges } from "../api/judge";
import { CJudge } from "./classes/CJudge";
import { RootStore } from "./RootStore";

export class JudgeStore {
  rootStore
  judges: Array<CJudge> = []
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
    const data = await getJudges(refresh, signal);
    runInAction(() => {
      data.forEach(json => this.updateJudge(json));
      this.loading = false;
    });
  }

  getJudges(ids?: number[]): CJudge[] {
    const result: CJudge[] = [];
    if (!ids || ids.length === 0) {
      return result;
    }
    for (const id of ids) {
      const judge = this.judges.find(item => item.id === id);
      if (judge) {
        result.push(judge);
      }
    }
    return result;
  }

  updateJudge(json: Judge) {
    let judge = this.judges.find(o => o.id === json.id);
    if (!judge) {
      judge = new CJudge(this, json.id)
      this.judges.push(judge)
    }
    judge.updateFromJson(json)
  }
}


