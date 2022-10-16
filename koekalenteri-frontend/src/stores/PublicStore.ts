import { reaction, makeAutoObservable, runInAction } from 'mobx';
import { getEvent, getEvents } from '../api/event';
import type { EventEx } from 'koekalenteri-shared/model';

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

type EventDateRange = {
  start: Date | null,
  end: Date | null
}

export class PublicStore {
  private _events: EventEx[] = [];
  public filteredEvents: EventEx[] = []
  public loaded = false;
  public loading = false;

  public eventTypeClasses: Record<string, string[]> = {
    NOU: [],
    'NOME-B': ['ALO', 'AVO', 'VOI'],
    'NOME-A': [],
    'NOWT': ['ALO', 'AVO', 'VOI']
  };

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

    // Reload events whenever the filter date range changes.
    // Note: This could be a plain autorun if the dates were actually passed to the fetch method.
    reaction(
      () => { return {
        start: this.filter.start,
        end: this.filter.end
      }},
      async (current: EventDateRange, previous: EventDateRange) => {
        if (current.start !== previous.start || current.end !== previous.end) {
          this.load()
        }
      }
    );
  }

  setFilter(filter: FilterProps) {
    this.filter = filter;
    this._applyFilter();
  }

  async initialize(signal?: AbortSignal) {
    if (!this.loaded) {
      this.load(signal)
    }
  }

  async load(signal?: AbortSignal) {
    if (this.loading) {
      return;
    }
    runInAction(() => {
      this.loading = true;
      this.loaded = false;
    })
    const events = await getEvents(signal);

    runInAction(() => {
      this._events = events.sort((a: EventEx, b: EventEx) => +new Date(a.startDate || new Date()) - +new Date(b.startDate || new Date()));
      this._applyFilter();
      this.loading = false;
      this.loaded = true;
    });
  }

  async get(eventType: string, id: string, signal?: AbortSignal) {
    const cached = this._events.find(event => event.eventType === eventType && event.id === id);
    if (cached) {
      return cached;
    }
    return getEvent(eventType, id, signal);
  }

  private _applyFilter() {
    const filter = this.filter;
    this.filteredEvents = this._events.filter(event => {
      return event.state !== 'draft' && !event.deletedAt
        && withinDateFilters(event, filter)
        && withinSwitchFilters(event, filter)
        && withinArrayFilters(event, filter);
    });

  }
}

function withinDateFilters(event: EventEx, { start, end }: FilterProps) {
  if (start && (!event.endDate || event.endDate < start)) {
    return false;
  }
  if (end && (!event.startDate || event.startDate > end)) {
    return false;
  }
  return true;
}

function withinSwitchFilters(event: EventEx, { withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces }: FilterProps) {
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
  if (eventClass.length && !eventClass.some(c => event.classes.map(cl => cl.class).includes(c))) {
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
