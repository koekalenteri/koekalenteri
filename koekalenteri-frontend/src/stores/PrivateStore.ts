import { makeAutoObservable, runInAction, when } from 'mobx';
import * as eventApi from '../api/event';
import { Event, EventEx, Registration } from 'koekalenteri-shared/model';

export class PrivateStore {
  private _loaded: boolean = false
  private _loading: boolean = false

  public selectedEvent: Partial<Event> | undefined = undefined
  public selectedEventRegistrations: Registration[] = []
  public newEvent: Partial<Event> = {}

  public events: Partial<EventEx>[] = []

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

  async selectEvent(id?: string, signal?: AbortSignal) {
    await when(() => this.loaded)
    let event: Partial<Event>|undefined
    let regs: Registration[] = []
    if (id) {
      event = await this.get(id, signal)
      if (event?.entries) {
        regs = await eventApi.getRegistrations(id, signal)
      }
    }
    runInAction(() => {
      this.selectedEvent = event
      this.selectedEventRegistrations = regs
    })
  }

  async load(signal?: AbortSignal) {
    if (this.loading) {
      return when(() => this.loaded)
    }
    this.loading = true;
    const events = await eventApi.getEvents(signal)
    runInAction(() => {
      this.events = events
    });
    this.loading = false
  }

  async get(id: string, signal?: AbortSignal): Promise<Partial<Event>|undefined> {
    if (!this.loaded) {
      await this.load(signal);
    }
    let event;
    runInAction(() => {
      event = this.events.find(e => e.id === id)
    })
    return event;
  }

  async putEvent(event: Partial<Event>, token?: string) {
    const newEvent = !event.id;
    const saved = await eventApi.putEvent(event, token);
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

  async deleteEvent(event: Partial<Event>, token?: string) {
    const index = this.events.findIndex(e => e.id === event.id);
    if (index > -1) {
      event.deletedAt = new Date();
      event.deletedBy = 'user';
      const saved = await this.putEvent(event, token);
      this.events.splice(index, 1);
      return saved;
    }
  }
}
