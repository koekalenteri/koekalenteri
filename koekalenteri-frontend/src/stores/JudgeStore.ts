import { makeAutoObservable } from 'mobx';
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
    this.judges = await judgeApi.getJudges();
    this.setLoading(false);
  }
}
