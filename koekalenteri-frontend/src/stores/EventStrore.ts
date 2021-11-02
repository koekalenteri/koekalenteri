import { makeAutoObservable } from 'mobx';
import * as eventApi from '../api/event';
import { startOfDay } from 'date-fns';
import { EventEx, extendEvent, extendEvents } from 'koekalenteri-shared';

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

  public loaded: boolean = false;
  public loading: boolean = false;
  public events: EventEx[] = [];
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

  async load() {
    this.setLoading(true);
    this._events = extendEvents(await eventApi.getEvents());
    this._applyFilter();
    this.setLoading(false);
  }

  async get(id: string) {
    const cached = this._events.find(event => event.id === id);
    if (cached) {
      return cached;
    }
    return extendEvent(await eventApi.getEvent(id));
  }

  private _applyFilter() {
    const today = startOfDay(new Date());
    const filter = this.filter;

    this.events = this._events.filter(event => {
      return withinDateFilters(event, filter)
        && withinSwitchFilters(event, filter, today)
        && withinArrayFilters(event, filter);
    });
  }
}

function withinDateFilters(event: EventEx, { start, end }: FilterProps) {
  if (start && new Date(event.endDate) < start) {
    return false;
  }
  if (end && new Date(event.startDate) > end) {
    return false;
  }
  return true;
}

function withinSwitchFilters(event: EventEx, { withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces }: FilterProps, today: Date) {
  if (!(withOpenEntry || withClosingEntry || withUpcomingEntry || withFreePlaces)) {
    // no filters
    return true;
  }
  const entryStartDate = new Date(event.entryStartDate);
  const isOpenEntry = event.isEntryOpen;
  let result = false;
  if (withOpenEntry) {
    result = result || isOpenEntry;
  }
  if (withClosingEntry) {
    result = result || event.isEntryClosing;
  }
  if (withUpcomingEntry) {
    result = result || entryStartDate > today;
  }
  if (withFreePlaces) {
    result = result || (isOpenEntry && event.places > event.entries);
  }
  return result;
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
