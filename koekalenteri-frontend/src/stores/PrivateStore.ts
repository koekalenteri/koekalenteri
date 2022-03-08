import { makeAutoObservable, runInAction } from 'mobx';
import * as officialApi from '../api/official';
import * as eventApi from '../api/event';
import { Event, EventEx, Official } from 'koekalenteri-shared/model';

export class PrivateStore {
  public loaded: boolean = false;
  public loading: boolean = false;

  public newEvent: Partial<Event> = {};
  public selectedEvent: Partial<Event> | undefined = undefined;

  public officials: Official[] = [];
  public events: Partial<EventEx>[] = [];

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

  setSelectedEvent(event: Partial<EventEx>|undefined) {
    this.selectedEvent = event;
  }

  async load(signal?: AbortSignal) {
    this.setLoading(true);
    const events = await eventApi.getEvents(signal);
    const officials = await officialApi.getOfficials(signal);
    runInAction(() => {
      this.events = events;
      this.officials = officials;
    });
    this.setLoading(false);
  }

  async get(id: string, signal?: AbortSignal): Promise<Partial<Event>|undefined> {
    if (!this.loaded) {
      await this.load(signal);
    }
    return this.events.find(e => e.id === id);
  }

  async putEvent(event: Partial<Event>) {
    const newEvent = !event.id;
    const saved = await eventApi.putEvent(event);
    if (newEvent) {
      this.events.push(saved);
      this.newEvent = {};
    } else {
      // Update cached instance (deleted events are not found)
      const oldInstance = this.events.find(e => e.id === event.id);
      if (oldInstance) {
        Object.assign(oldInstance, saved);
      }
    }
    return saved;
  }

  async deleteEvent(event: Partial<Event>) {
    const index = this.events.findIndex(e => e.id === event.id);
    if (index > -1) {
      event.deletedAt = new Date();
      event.deletedBy = 'user';
      const saved = await this.putEvent(event);
      this.events.splice(index, 1);
      return saved;
    }
  }
}
