import { Organizer } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { OrganizerStore } from "../OrganizerStore";


export class COrganizer {
  id: number = 0;
  name: string = "";
  search: string = "";
  store: OrganizerStore;

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
    this.search = json.name.toLocaleLowerCase();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name
    }
  }
}
