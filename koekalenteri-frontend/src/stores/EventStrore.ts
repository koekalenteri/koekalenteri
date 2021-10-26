import { makeAutoObservable } from 'mobx';
import * as eventApi from '../api/event';
import { Event } from 'koekalenteri-shared/model';
import { subDays, startOfDay } from 'date-fns';

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
  private _events: Event[] = [];

  public loading: boolean = false;
  public events: Event[] = [];
  public filter: FilterProps = {
    start: null, // new Date(),
    end: null,
    withOpenEntry: false,
    withUpcomingEntry: false,
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
  }

  async load() {
    this.setLoading(true);
    this._events = await eventApi.getEvents();
    this._applyFilter();
    this.setLoading(false);
  }

  private _applyFilter() {
    const today = startOfDay(new Date());
    const {
      start, end,
      eventType, eventClass,
      judge, organizer,
      withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces
    } = this.filter;

    this.events = this._events.filter(event => {
      if (start && new Date(event.endDate) < start) {
        return false;
      }
      if (end && new Date(event.startDate) > end) {
        return false;
      }
      const entryStartDate = new Date(event.entryStartDate);
      const entryEndDate = new Date(event.entryEndDate);
      const isClosedEntry = (entryStartDate >= today || entryEndDate <= today)
      if (withOpenEntry && isClosedEntry) {
        return false;
      }
      if (withClosingEntry && (isClosedEntry || subDays(entryEndDate, 7) >= today)) {
        return false;
      }
      if (withUpcomingEntry && entryStartDate <= today) {
        return false;
      }
      if (withFreePlaces && event.places <= event.entries) {
        return false;
      }
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
    });
  }
}
