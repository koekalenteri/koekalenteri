import { makeAutoObservable } from 'mobx';
import { Event } from "koekalenteri-shared/model/Event";


export class EventStore {
  public events: Event[] = [];

  constructor() {
    makeAutoObservable(this)
  }
}
