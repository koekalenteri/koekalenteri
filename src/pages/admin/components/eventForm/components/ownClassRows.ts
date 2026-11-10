import type { DayKey, EventClass, OwnClass } from '@/types'
import { nanoid } from 'nanoid'

/**
 * A row of the own classes editor (KOE-674): an id of its own, as its code changes while it is typed,
 * and the code its class days are stored under. The two codes part while the row's code is one another
 * row holds: typing OPEN2 passes through OPEN, and that row's days stay its own.
 */
export interface Row {
  id: string
  dayCode: string
}

/** The editor's state: its rows, the own classes they show, and the event's class days. */
export interface OwnClassRows {
  rows: Row[]
  ownClasses: OwnClass[]
  classes: EventClass[]
}

/** The trial's days, of which a trial of one day gives a class its day at once. */
export interface TrialDays {
  startDate: DayKey
  endDate: DayKey
}

const rowOf = (dayCode: string): Row => ({ dayCode, id: nanoid() })

const daysOf = (classes: readonly EventClass[], code: string) => classes.some((eventClass) => eventClass.class === code)

/**
 * The rows for own classes as stored: each keeps its days under its code, and of two rows showing one
 * code the first keeps them, so no two rows ever keep their days under the same code.
 */
export const initialRows = (ownClasses: readonly OwnClass[]): Row[] =>
  ownClasses.map(({ code }, at) => rowOf(ownClasses.findIndex((item) => item.code === code) === at ? code : ''))

/** The class days with each code of `moves` renamed at once, so codes can trade places. */
const movedClasses = (classes: readonly EventClass[], moves: ReadonlyMap<string, string>) =>
  classes.map((eventClass) => {
    const to = moves.get(eventClass.class)
    return to === undefined ? eventClass : { ...eventClass, class: to }
  })

/**
 * The rows' days where their codes say (KOE-674), one step at a time until nothing changes. A row wants
 * its days under the code it shows, and moves them there when no other row keeps days under that code;
 * where rows wait on each other in a ring (A to B while B goes to A), the ring moves at once. A row whose
 * code another row's days still hold keeps its days where they are, and they follow it the moment the
 * way is free: typing OPEN2 through another row's OPEN leaves that row's days alone. Of two rows showing
 * one code, only one can keep days under it. On a trial of one day, a row in place whose code no other
 * row shows gets the trial's day if it has none. No day is ever merged into, or taken from, another row.
 */
const reconciled = (state: OwnClassRows, trial: TrialDays): OwnClassRows => {
  const codes = state.ownClasses.map(({ code }) => code)
  const rows = [...state.rows]
  let classes = [...state.classes]

  // Each step puts at least one row's days in place for good; the bound only guards the loop.
  for (let round = 0; round <= rows.length * rows.length; round++) {
    const step = nextStep(rows, codes)
    if (!step) break
    classes = movedClasses(classes, step.moves)
    for (const [at, dayCode] of step.dayCodes) rows[at] = { ...rows[at], dayCode }
  }
  return { ...state, classes: withTrialDay(classes, rows, codes, trial), rows }
}

/** Whether a code is one row's alone. */
const uniqueIn = (codes: readonly string[], code: string) =>
  !!code && codes.filter((item) => item === code).length === 1

/** One step of putting the rows' days in place: the codes the days move between, and the rows' new day codes. */
interface Step {
  moves: Map<string, string>
  dayCodes: Map<number, string>
}

/**
 * The next step towards every row's days under the code it shows (`reconciled`), or none once no step is
 * left: a row whose code is free takes its days there; else a ring of rows waiting on each other moves at
 * once; else a row whose code no other row shows trades places with the row whose shared code holds it up.
 */
const nextStep = (rows: readonly Row[], codes: readonly string[]): Step | undefined => {
  const wanting = rows.flatMap((row, at) => (codes[at] && row.dayCode !== codes[at] ? [at] : []))
  if (!wanting.length) return undefined
  const keeper = (code: string) => rows.findIndex((row) => row.dayCode === code)

  const free = wanting.find((at) => keeper(codes[at]) === -1)
  if (free !== undefined) {
    const from = rows[free].dayCode
    return { dayCodes: new Map([[free, codes[free]]]), moves: new Map(from ? [[from, codes[free]]] : []) }
  }
  // Every wanting row waits on another row's days: follow the waits to a ring of wanting rows.
  const ring = ringFrom(wanting, (at) => keeper(codes[at]))
  if (ring) {
    return {
      dayCodes: new Map(ring.map((at) => [at, codes[at]])),
      moves: new Map(ring.map((at) => [rows[at].dayCode, codes[at]])),
    }
  }
  // A row whose code no other row shows comes before one whose code is shared, which is still being
  // typed through: the two trade places, so neither row's days are merged or lost.
  const first = wanting.find(
    (at) => uniqueIn(codes, codes[at]) && !!rows[at].dayCode && !uniqueIn(codes, codes[keeper(codes[at])] ?? '')
  )
  if (first === undefined) return undefined
  const from = rows[first].dayCode
  return {
    dayCodes: new Map([
      [first, codes[first]],
      [keeper(codes[first]), from],
    ]),
    moves: new Map([
      [from, codes[first]],
      [codes[first], from],
    ]),
  }
}

/** On a trial of one day, the trial's day for each row in place whose code is its alone and has none. */
const withTrialDay = (
  classes: EventClass[],
  rows: readonly Row[],
  codes: readonly string[],
  trial: TrialDays
): EventClass[] => {
  if (trial.startDate !== trial.endDate) return classes
  const added = rows.flatMap((row, at) =>
    uniqueIn(codes, codes[at]) && row.dayCode === codes[at] && !daysOf(classes, codes[at])
      ? [{ class: codes[at], date: trial.startDate }]
      : []
  )
  return [...classes, ...added]
}

/** A ring of rows each waiting on the next, starting from any of `wanting`; none where a wait ends. */
const ringFrom = (wanting: readonly number[], waitsOn: (at: number) => number): number[] | undefined => {
  for (const start of wanting) {
    const path: number[] = []
    let at = start
    while (wanting.includes(at) && !path.includes(at)) {
      path.push(at)
      at = waitsOn(at)
    }
    if (path.includes(at)) return path.slice(path.indexOf(at))
  }
  return undefined
}

/** A row's code changed to `code`; a code cleared takes the row's days along. */
export const renameRow = (state: OwnClassRows, at: number, code: string, trial: TrialDays): OwnClassRows => {
  const own = state.rows[at].dayCode
  const cleared = !code && !!own
  return reconciled(
    {
      classes: cleared ? state.classes.filter((eventClass) => eventClass.class !== own) : [...state.classes],
      ownClasses: state.ownClasses.map((item, index) => (index === at ? { ...item, code } : item)),
      rows: state.rows.map((row, index) => (index === at && cleared ? { ...row, dayCode: '' } : row)),
    },
    trial
  )
}

/** A row removed, and its days with it; another row may then take its code's place. */
export const removeRow = (state: OwnClassRows, at: number, trial: TrialDays): OwnClassRows => {
  const own = state.rows[at].dayCode
  return reconciled(
    {
      classes: own ? state.classes.filter((eventClass) => eventClass.class !== own) : [...state.classes],
      ownClasses: state.ownClasses.filter((_, index) => index !== at),
      rows: state.rows.filter((_, index) => index !== at),
    },
    trial
  )
}

/** A row added at the end; the first takes the trial off the official classes, so their days go. */
export const addRow = (state: OwnClassRows): OwnClassRows => ({
  classes: state.ownClasses.length ? [...state.classes] : [],
  ownClasses: [...state.ownClasses, { code: '', name: {} }],
  rows: [...state.rows, rowOf('')],
})

/** Two rows trade places in the list, each with its days. */
export const swapRows = (state: OwnClassRows, at: number, other: number): OwnClassRows => {
  const ownClasses = [...state.ownClasses]
  ownClasses[at] = state.ownClasses[other]
  ownClasses[other] = state.ownClasses[at]
  const rows = [...state.rows]
  rows[at] = state.rows[other]
  rows[other] = state.rows[at]
  return { classes: [...state.classes], ownClasses, rows }
}
