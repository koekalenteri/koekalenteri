import i18next from "i18next";
import { Judge } from "koekalenteri-shared/model";
import { makeAutoObservable, runInAction } from "mobx";
import { getJudges, putJudge } from "../api/judge";
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

  get activeJudges() {
    return this.judges.filter(judge => judge.active);
  }

  async load(refresh?: boolean, signal?: AbortSignal) {
    if (this.loading) {
      return;
    }
    runInAction(() => {
      this.loading = true;
    });
    const data = await getJudges(refresh, signal);
    runInAction(() => {
      this.judges = [];
      data.forEach(json => this.updateJudge(json));
      this.judges.sort((a, b) => a.name.localeCompare(b.name, i18next.language));
      this.loading = false;
    });
  }

  getJudge(id: number): CJudge | undefined {
    return this.judges.find(item => item.id === id);
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

  async save(judge: Judge) {
    try {
      runInAction(() => {
        this.loading = true;
      });
      const saved = await putJudge(judge);
      runInAction(() => {
        this.updateJudge(saved);
        this.loading = false;
      });
    } catch (e) {
      console.error(e);
      this.loading = false;
    }
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


