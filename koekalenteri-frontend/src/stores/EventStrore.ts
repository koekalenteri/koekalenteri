import { makeAutoObservable } from 'mobx';
import * as eventApi from '../api/event';
import { Event } from "koekalenteri-shared/model/Event";

export type FilterProps = {
  start: Date | null
  end: Date | null
  eventType: string
  eventClass: string
}
export class EventStore {
  private _events: Event[] = [];

  public loading: boolean = false;
  public events: Event[] = [];
  public filter: FilterProps = {
    start: null, // new Date(),
    end: null,
    eventType: '',
    eventClass: ''
  }

  constructor() {
    makeAutoObservable(this)
  }

  setEvents(events: Event[]) {
    this.events = events;
  }

  setFilter(filter: FilterProps) {
    const reload = filter.start !== this.filter.start || filter.end !== this.filter.end;
    this.filter = filter;
    if (reload) {
      this.load();
    } else {
      this._applyFilter();
    }
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
    const { start, end, eventType, eventClass } = this.filter;
    this.events = this._events.filter(event => {
      if (start && new Date(event.endDate) < start) {
        return false;
      }
      if (end && new Date(event.startDate) > end) {
        return false;
      }
      if (eventType && event.eventType !== eventType) {
        return false;
      }
      if (eventClass && !event.classes?.includes(eventClass)) {
        return false;
      }
      return true;
    });
  }
}
