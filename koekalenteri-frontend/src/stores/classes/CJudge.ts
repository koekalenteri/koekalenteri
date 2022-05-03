import { Judge } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { JudgeStore } from "../JudgeStore";


export class CJudge {
  active?: boolean;
  district: string = "";
  email: string = "";
  eventTypes: string[] = [];
  id: number = 0;
  languages: string[] = [];
  location: string = "";
  name: string = "";
  official?: boolean;
  phone: string = "";
  search: string = "";
  store: JudgeStore;

  constructor(store: JudgeStore, id: number) {
    makeAutoObservable(this, {
      id: false,
      store: false,
    });
    this.id = id;
    this.store = store;
  }

  updateFromJson(json: Judge) {
    this.active = json.active;
    this.district = json.district;
    this.email = json.email;
    this.eventTypes = json.eventTypes;
    this.languages = json.languages;
    this.location = json.location;
    this.name = json.name;
    this.official = json.official;
    this.phone = json.phone;
    this.search = [json.district, json.email, ...(json.eventTypes || []), json.location, json.name, json.phone].map(v => v?.toLocaleLowerCase() || '').join(' ');
  }

  toJSON(): Judge {
    return {
      active: this.active,
      district: this.district,
      email: this.email,
      eventTypes: this.eventTypes,
      id: this.id,
      languages: this.languages,
      location: this.location,
      name: this.name,
      official: this.official,
      phone: this.phone,
    }
  }
}
