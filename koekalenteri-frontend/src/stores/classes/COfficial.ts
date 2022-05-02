import { Official } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { OfficialStore } from "../OfficialStore";


export class COfficial {
  district: string = "";
  email: string = "";
  eventTypes: string[] = [];
  id: number = 0;
  location: string = "";
  name: string = "";
  phone: string = "";
  search: string = "";
  store: OfficialStore | null = null;

  constructor(store: OfficialStore, id: number) {
    makeAutoObservable(this, {
      id: false,
      store: false,
    });
    this.id = id;
    this.store = store;
  }

  updateFromJson(json: Official) {
    this.district = json.district;
    this.email = json.email;
    this.eventTypes = json.eventTypes;
    this.location = json.location;
    this.name = json.name;
    this.phone = json.phone;
    this.search = [json.email, json.name, json.location, json.phone].map(v => v.toLocaleLowerCase()).join(' ');
  }

  toJSON(): Official {
    return {
      district: this.district,
      email: this.email,
      eventTypes: this.eventTypes,
      id: this.id,
      location: this.location,
      name: this.name,
      phone: this.phone,
    };
  }
}
