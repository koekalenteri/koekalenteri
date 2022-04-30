import { DeepPartial, Dog, Registration, RegistrationBreeder, RegistrationPerson } from "koekalenteri-shared/model";
import merge from "lodash.merge";
import { makeAutoObservable, runInAction, toJS } from "mobx";
import { getDog } from "../api/dog";
import { RootStore } from "./RootStore";

const STORAGE_KEY = 'dog-cache';

export type DogCachedInfo = {
  breeder: RegistrationBreeder,
  handler: RegistrationPerson,
  owner: RegistrationPerson,
  ownerHandles: boolean,
}

export class DogStore {
  rootStore
  _data: Record<string, Partial<Dog & DogCachedInfo>> = {}

  constructor(rootStore: RootStore) {
    makeAutoObservable(this, {
      rootStore: false
    })
    this.rootStore = rootStore;
    const stored = localStorage.getItem(STORAGE_KEY);
    runInAction(() => {
      this._data = stored ? JSON.parse(stored) : {};
    });
    window.addEventListener('storage', this._change);

  }

  dispose() {
    window.removeEventListener("storage", this._change)
  }

  private _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
  }

  private _change(e: StorageEvent) {
    runInAction(() => {
      if (e.storageArea === localStorage && e.key === STORAGE_KEY) {
        this._data = e.newValue ? JSON.parse(e.newValue) : {};
      }
    });
  }

  get dogs() {
    return Object.values(this._data);
  }

  async load(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Partial<Dog & DogCachedInfo>> {
    const official = await getDog(regNo, refresh, signal);
    const local = this._data[regNo] || {};
    return toJS({
      ...local,
      ...official
    });
  }

  save(reg: DeepPartial<Registration>) {
    const regNo = reg.dog?.regNo;
    if (regNo) {
      const record = merge(this._data[regNo] || {},
        reg.dog,
        {
          breeder: reg.breeder,
          handler: reg.handler,
          owner: reg.owner,
          ownerHandles: reg.ownerHandles,
        });
      this._data[regNo] = {
        breeder: record.breeder,
        callingName: record.callingName,
        dam: record.dam,
        handler: record.handler,
        owner: record.owner,
        ownerHandles: !!record.ownerHandles,
        regNo: record.regNo,
        sire: record.sire,
        titles: record.titles,
      };
      this._save();
    }
  }
}


