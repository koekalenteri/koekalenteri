import type { EventEx } from 'koekalenteri-shared/model';

export function entryDateColor(event: EventEx) {
  if (!event.isEntryOpen) {
    return 'text.primary';
  }
  return event.isEntryClosing ? 'warning.main' : 'success.main';
}

export function unique(arr: string[]): string[] {
  return arr.filter((c, i, a) => a.indexOf(c) === i);
}

export function uniqueDate(arr: Date[]): Date[] {
  return arr.filter((c, i, a) => a.findIndex(f => f.valueOf() === c.valueOf()) === i);
}
