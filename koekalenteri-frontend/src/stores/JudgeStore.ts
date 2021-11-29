import { makeAutoObservable, runInAction } from 'mobx';
import * as judgeApi from '../api/judge';
import { Judge } from 'koekalenteri-shared';

export class JudgeStore {
  public loading: boolean = false;
  public judges: Judge[] = [];

  constructor() {
    makeAutoObservable(this)
  }

  setLoading(value: boolean) {
    this.loading = value;
  }

  async load() {
    this.setLoading(true);
    const judges = await judgeApi.getJudges();
    runInAction(() => {
      this.judges = judges;
    });
    this.setLoading(false);
  }
}
