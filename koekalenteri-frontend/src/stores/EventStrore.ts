import { makeAutoObservable } from 'mobx';
import * as eventApi from '../api/event';
import { Event } from 'koekalenteri-shared/model';

export type FilterProps = {
  start: Date | null
  end: Date | null
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
    const { start, end, eventType, eventClass, judge, organizer } = this.filter;
    this.events = this._events.filter(event => {
      if (start && new Date(event.endDate) < start) {
        return false;
      }
      if (end && new Date(event.startDate) > end) {
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
