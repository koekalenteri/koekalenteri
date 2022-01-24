import { makeAutoObservable } from 'mobx';
import * as eventApi from '../api/event';
import { startOfDay } from 'date-fns';
import type { Event, EventEx } from 'koekalenteri-shared/model';

export type FilterProps = {
  start: Date | null
  end: Date | null
  withOpenEntry?: boolean
  withClosingEntry?: boolean
  withUpcomingEntry?: boolean
  withFreePlaces?: boolean
  eventType: string[]
  eventClass: string[]
  judge: number[]
  organizer: number[]
}

export class EventStore {
  private _events: EventEx[] = [];
  private _open: Record<string, boolean> = {};

  public loaded: boolean = false;
  public loading: boolean = false;
  public filteredEvents: EventEx[] = [];
  public userEvents: EventEx[] = [];
  public newEvent: Partial<Event> = {eventType: ''};
  public selectedEvent: Event | undefined = undefined;
  public filter: FilterProps = {
    start: null,
    end: null,
    withOpenEntry: true,
    withUpcomingEntry: true,
    withClosingEntry: false,
    withFreePlaces: false,
    eventType: [],
    eventClass: [],
    judge: [],
    organizer: []
  }

  constructor() {
    makeAutoObservable(this)
  }

  async setFilter(filter: FilterProps) {
    const reload = filter.start !== this.filter.start || filter.end !== this.filter.end;
    this.filter = filter;
    return reload ? this.load() : this._applyFilter();
  }

  setLoading(value: boolean) {
    this.loading = value;
    this.loaded = !value;
  }

  setOpen(id: string, value: boolean) {
    this._open[id] = value;
  }

  setNewEvent(event: Partial<Event>) {
    this.newEvent = event;
  }

  setSelectedEvent(event: EventEx|undefined) {
    this.selectedEvent = event;
  }

  isOpen(id: string) {
    return this._open[id] || false;
  }

  async load() {
    this.setLoading(true);
    this._events = (await eventApi.getEvents())
      .sort((a: EventEx, b: EventEx) => +new Date(a.startDate) - +new Date(b.startDate));
    this._applyFilter();

    // TODO
    this.userEvents = this._events;

    this.setLoading(false);
  }

  async get(eventType: string, id: string, signal?: AbortSignal) {
    const cached = this._events.find(event => event.eventType === eventType && event.id === id);
    if (cached) {
      return cached;
    }
    return eventApi.getEvent(eventType, id, signal);
  }

  async save(event: Partial<Event>) {
    const saved = await eventApi.createEvent(event);
    if (!event.id) {
      this.userEvents.push(saved);
      this.newEvent = {eventType: ''};
    } else {
      const old = this.userEvents.find(e => e.id === event.id);
      if (old) {
        Object.assign(old, event);
      }
    }
  }

  async delete(event: Event) {
    const index = this.userEvents.findIndex(e => e.id === event.id);
    if (index > -1) {
      this.userEvents.splice(index, 1);
      event.deletedAt = new Date();
      event.deletedBy = 'user';
      return this.save(event);
    }
  }

  private _applyFilter() {
    const today = startOfDay(new Date());
    const filter = this.filter;

    this.filteredEvents = this._events.filter(event => {
      return withinDateFilters(event, filter)
        && withinSwitchFilters(event, filter, today)
        && withinArrayFilters(event, filter);
    });
  }
}

function withinDateFilters(event: EventEx, { start, end }: FilterProps) {
  if (start && event.endDate < start) {
    return false;
  }
  if (end && event.startDate > end) {
    return false;
  }
  return true;
}

function withinSwitchFilters(event: EventEx, { withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces }: FilterProps, today: Date) {
  let result;

  if (withOpenEntry) {
    result =  event.isEntryOpen;
    if (withClosingEntry) {
      result = result && event.isEntryClosing;
    }
    if (withFreePlaces) {
      result = result && event.places > event.entries;
    }
  }

  if (withUpcomingEntry) {
    result = result || event.isEntryUpcoming;
  }

  return result !== false;
}

function withinArrayFilters(event: EventEx, { eventType, eventClass, judge, organizer }: FilterProps) {
  if (eventType.length && !eventType.includes(event.eventType)) {
    return false;
  }
  if (eventClass.length && !eventClass.some(c => event.classes?.includes(c))) {
    return false;
  }
  if (judge.length && !judge.some(j => event.judges?.includes(j))) {
    return false;
  }
  if (organizer.length && !organizer.includes(event.organizer?.id)) {
    return false;
  }
  return true;
}
