import { makeAutoObservable, runInAction } from 'mobx';
import * as eventApi from '../api/event';
import { Event, EventEx } from 'koekalenteri-shared/model';

export class PrivateStore {
  private _loaded: boolean = false;
  private _loading: boolean = false;

  public newEvent: Partial<Event> = {};
  public selectedEvent: Partial<Event> | undefined = undefined;

  public events: Partial<EventEx>[] = [];

  constructor() {
    makeAutoObservable(this)
  }

  get loaded() { return this._loaded }
  get loading() { return this._loading }

  set loading(v) {
    this._loading = v;
    this._loaded = !v;
  }

  setNewEvent(event: Partial<Event>) {
    this.newEvent = event;
  }

  setSelectedEvent(event: Partial<EventEx>|undefined) {
    this.selectedEvent = event;
  }

  async load(signal?: AbortSignal) {
    if (this.loading) {
      return;
    }
    this.loading = true;
    const events = await eventApi.getEvents(signal);
    runInAction(() => {
      this.events = events;
    });
    this.loading = false;
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
