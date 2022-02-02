import { makeAutoObservable, runInAction } from 'mobx';
import * as officialApi from '../api/official';
import * as eventApi from '../api/event';
import { Event, EventEx, Official } from 'koekalenteri-shared/model';

export class PrivateStore {
  public loaded: boolean = false;
  public loading: boolean = false;

  public newEvent: Partial<Event> = {eventType: ''};
  public selectedEvent: Event | undefined = undefined;

  public officials: Official[] = [];
  public events: EventEx[] = [];

  constructor() {
    makeAutoObservable(this)
  }

  setLoading(value: boolean) {
    this.loading = value;
    this.loaded = !value;
  }

  setNewEvent(event: Partial<Event>) {
    this.newEvent = event;
  }

  setSelectedEvent(event: EventEx|undefined) {
    this.selectedEvent = event;
  }

  async load() {
    this.setLoading(true);
    const events = await eventApi.getEvents();
    const officials = await officialApi.getOfficials();
    runInAction(() => {
      this.events = events;
      this.officials = officials;
    });
    this.setLoading(false);
  }

  async saveEvent(event: Partial<Event>) {
    const newEvent = !event.id;
    const saved = await eventApi.saveEvent(event);
    if (newEvent) {
      this.events.push(saved);
      this.newEvent = {eventType: ''};
    } else {
      // Update cached instance (deleted events are not found)
      const oldInstance = this.events.find(e => e.id === event.id);
      if (oldInstance) {
        Object.assign(oldInstance, saved);
      }
    }
    return saved;
  }

  async deleteEvent(event: Event) {
    const index = this.events.findIndex(e => e.id === event.id);
    if (index > -1) {
      event.deletedAt = new Date();
      event.deletedBy = 'user';
      const saved = await this.saveEvent(event);
      this.events.splice(index, 1);
      return saved;
    }
  }
}
