import { Registration } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { getRegistration, getRegistrations, putRegistration } from "../api/event";
import { RootStore } from "./RootStore";

export class RegistrationStore {
  rootStore
  registration: Partial<Registration> = {}

  constructor(rootStore: RootStore) {
    makeAutoObservable(this, {
      rootStore: false
    })
    this.rootStore = rootStore;
  }

  async load(eventId: string, id: string, signal?: AbortSignal) {
    return getRegistration(eventId, id, signal);
  }

  async loadAll(eventId: string, signal?: AbortSignal) {
    return getRegistrations(eventId, signal);
  }

  async save(registration: Registration) {
    return putRegistration(registration);
  }
}
