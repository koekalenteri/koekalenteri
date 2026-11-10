import type { DayKey, EventClass, OwnClass } from '@/types'
import type { OwnClassRows, TrialDays } from './ownClassRows'
import { addRow, initialRows, removeRow, renameRow, swapRows } from './ownClassRows'

/** A small seeded generator (mulberry32), so a failing sequence can be run again by its seed. */
const random = (seed: number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CODES = ['A', 'B', 'AB', 'C']
const DAY_1: DayKey = '2099-06-06'
const DAY_2: DayKey = '2099-06-07'

/**
 * Each class day the test makes is known by its places, and its judge carries the same number: a day
 * that loses or swaps its judge or places shows up as a mismatch.
 */
const day = (code: string, id: number, date: DayKey): EventClass => ({
  class: code,
  date,
  judge: { id, name: `Tuomari ${id}` },
  places: id,
})

const idOf = (eventClass: EventClass) => eventClass.places

type Step =
  | { kind: 'rename'; at: number; code: string }
  | { kind: 'remove'; at: number }
  | { kind: 'add' }
  | { kind: 'swap'; at: number }

const stepOf = (next: () => number, rows: number): Step => {
  const pick = next()
  const at = Math.floor(next() * rows)
  if (rows === 0 || pick < 0.1) return { kind: 'add' }
  if (pick < 0.2 && rows > 1) return { at, kind: 'remove' }
  if (pick < 0.3 && rows > 1) return { at: Math.min(at, rows - 2), kind: 'swap' }
  const code = next() < 0.1 ? '' : CODES[Math.floor(next() * CODES.length)]
  return { at, code, kind: 'rename' }
}

/** Runs one seeded sequence and checks the rows' days after every step. */
const runSequence = (seed: number) => {
  const next = random(seed)
  const trial: TrialDays = { endDate: next() < 0.5 ? DAY_1 : DAY_2, startDate: DAY_1 }
  const count = 2 + Math.floor(next() * 3)
  const ownClasses: OwnClass[] = CODES.slice(0, count).map((code) => ({ code, name: { fi: code } }))
  let id = 0
  const classes = ownClasses.flatMap(({ code }) => [day(code, ++id, DAY_1), day(code, ++id, DAY_2)])
  let state: OwnClassRows = { classes, ownClasses, rows: initialRows(ownClasses) }
  // Which row each day the test made belongs to.
  const owner = new Map<number, string>()
  for (const eventClass of classes) {
    const at = ownClasses.findIndex(({ code }) => code === eventClass.class)
    owner.set(idOf(eventClass) ?? 0, state.rows[at].id)
  }
  const trace: Step[] = []

  for (let n = 0; n < 12; n++) {
    const step = stepOf(next, state.rows.length)
    trace.push(step)
    const before = state
    if (step.kind === 'rename') state = renameRow(state, step.at, step.code, trial)
    else if (step.kind === 'remove') state = removeRow(state, step.at, trial)
    else if (step.kind === 'swap') state = swapRows(state, step.at, step.at + 1)
    else state = addRow(state)

    // The rows whose days the step may take: a row removed, or a row whose code is cleared.
    const ended = step.kind === 'remove' || (step.kind === 'rename' && !step.code) ? before.rows[step.at].id : undefined
    const kept = new Map(
      state.classes.flatMap((eventClass) => (idOf(eventClass) ? [[idOf(eventClass), eventClass]] : []))
    )
    for (const [dayId, rowId] of [...owner]) {
      const found = kept.get(dayId)
      if (!found) {
        expect(rowId, `seed ${seed}: day ${dayId} lost after ${JSON.stringify(trace)}`).toBe(ended)
        owner.delete(dayId)
        continue
      }
      expect(found.judge, `seed ${seed}: day ${dayId} judge after ${JSON.stringify(trace)}`).toEqual({
        id: dayId,
        name: `Tuomari ${dayId}`,
      })
    }
  }

  // Every row whose code no other row shows has its own days under that code.
  const codes = state.ownClasses.map(({ code }) => code)
  state.rows.forEach((row, at) => {
    const code = codes[at]
    if (!code || codes.filter((other) => other === code).length > 1) return
    for (const [dayId, rowId] of owner) {
      if (rowId !== row.id) continue
      const found = state.classes.find((eventClass) => idOf(eventClass) === dayId)
      expect(found?.class, `seed ${seed}: row ${code} day ${dayId} after ${JSON.stringify(trace)}`).toBe(code)
    }
  })
}

describe('own class rows (KOE-674)', () => {
  // R1 A is renamed to B, which R2 holds; then R2 is renamed to C, which frees B for R1's days.
  it('moves a blocked row its days once another rename frees its code', () => {
    const ownClasses: OwnClass[] = [
      { code: 'A', name: { fi: 'A' } },
      { code: 'B', name: { fi: 'B' } },
    ]
    const trial = { endDate: DAY_2, startDate: DAY_1 }
    let state: OwnClassRows = {
      classes: [day('A', 1, DAY_1), day('B', 2, DAY_2)],
      ownClasses,
      rows: initialRows(ownClasses),
    }

    state = renameRow(state, 0, 'B', trial)
    state = renameRow(state, 1, 'C', trial)

    expect(state.classes).toEqual([day('B', 1, DAY_1), day('C', 2, DAY_2)])
  })

  it.each(Array.from({ length: 300 }, (_, seed) => seed + 1))(
    'keeps every day with its row through a random sequence of edits (seed %i)',
    (seed) => runSequence(seed)
  )
})
