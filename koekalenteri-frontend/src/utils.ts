import type { EventEx, JsonValue } from 'koekalenteri-shared/model'

export function entryDateColor(event: EventEx) {
  if (!event.isEntryOpen) {
    return 'text.primary'
  }
  return event.isEntryClosing ? 'warning.main' : 'success.main'
}

export function unique<T = string>(arr: T[]): T[] {
  return arr.filter((c, i, a) => a.indexOf(c) === i)
}

export function uniqueFn<T>(arr: T[], cmp: (a: T, b: T) => boolean): T[] {
  return arr.filter((c, i, a) => a.findIndex(f => cmp(f, c)) === i)
}

export function uniqueDate(arr: Date[]): Date[] {
  return uniqueFn<Date>(arr, (a, b) => a.valueOf() === b.valueOf())
}

function dateReviver(_key: string, value: JsonValue): JsonValue | Date {
  if (typeof value === 'string' && /^\d{4}-[01]\d-[0-3]\dT[012]\d(?::[0-6]\d){2}\.\d{3}Z$/.test(value)) {
    const date = new Date(value)
    if (!isNaN(+date)) {
      return date
    }
  }
  return value
}

export const parseJSON = (json: string) => JSON.parse(json, dateReviver)
