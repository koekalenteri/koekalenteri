import { makeAutoObservable, runInAction } from 'mobx';
import * as organizerApi from '../api/organizer';
import { Organizer } from 'koekalenteri-shared';

export class OrganizerStore {
  public loading: boolean = false;
  public organizers: Organizer[] = [];

  constructor() {
    makeAutoObservable(this)
  }

  setLoading(value: boolean) {
    this.loading = value;
  }

  async load() {
    this.setLoading(true);
    const organizers = await organizerApi.getOrganizers();
    runInAction(() => {
      this.organizers = organizers;
    });
    this.setLoading(false);
  }
}
