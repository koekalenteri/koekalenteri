import { EventEx } from "koekalenteri-shared";

export function entryDateColor(event: EventEx) {
  if (!event.isEntryOpen) {
    return 'text.primary';
  }
  return event.isEntryClosing ? 'warning.main' : 'success.main';
}
