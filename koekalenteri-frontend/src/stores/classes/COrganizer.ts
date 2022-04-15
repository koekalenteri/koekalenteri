import { Organizer } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { OrganizerStore } from "../OrganizerStore";


export class COrganizer {
  id: number = 0;
  name: string = "";
  store: OrganizerStore | null = null;

  constructor(store: OrganizerStore, id: number) {
    makeAutoObservable(this, {
      id: false,
      store: false,
    });
    this.id = id;
    this.store = store;
  }

  updateFromJson(json: Organizer) {
    this.name = json.name;
  }
}
