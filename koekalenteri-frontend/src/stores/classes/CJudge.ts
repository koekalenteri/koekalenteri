import { Judge } from "koekalenteri-shared/model";
import { makeAutoObservable } from "mobx";
import { JudgeStore } from "../JudgeStore";


export class CJudge {
  district: string = "";
  email: string = "";
  eventTypes: string[] = [];
  id: number = 0;
  languages: string[] = [];
  location: string = "";
  name: string = "";
  phone: string = "";
  search: string = "";
  store: JudgeStore | null = null;

  constructor(store: JudgeStore, id: number) {
    makeAutoObservable(this, {
      id: false,
      store: false,
    });
    this.id = id;
    this.store = store;
  }

  updateFromJson(json: Judge) {
    this.district = json.district;
    this.email = json.email;
    this.eventTypes = json.eventTypes;
    this.languages = json.languages;
    this.location = json.location;
    this.name = json.name;
    this.phone = json.phone;
    this.search = [json.district, json.email, ...(json.eventTypes || []), json.location, json.name, json.phone].map(v => v?.toLocaleLowerCase() || '').join(' ');
  }

  toJSON(): Judge {
    return {
      district: this.district,
      email: this.email,
      eventTypes: this.eventTypes,
      id: this.id,
      languages: this.languages,
      location: this.location,
      name: this.name,
      phone: this.phone,
    }
  }
}
