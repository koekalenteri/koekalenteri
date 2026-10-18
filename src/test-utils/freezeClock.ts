import { isDayKey } from '../lib/day'
import { noonOfFinnishDay } from './finnishDays'

/** Midday of `day` in Helsinki, so no time zone lands it on a neighbour. */
const middayOf = (day: string) => {
  if (!isDayKey(day)) throw new RangeError(`Not a day: ${day}`)
  return noonOfFinnishDay(day).getTime()
}

/**
 * Freezes the calling file's clock to one day, so that a screenshot of anything date-shaped renders
 * the same picture whatever day it runs on.
 *
 * Such a test has to hold still in two ways, and pinning the fixture's dates only gives one of them.
 * It stops the printed dates changing pixels, but what a component *says* about them is read off
 * where they sit relative to today: the calendar row kept its 9.9.2026 and began announcing that the
 * trial was over the morning the real clock passed it, which left main red for a week (KOE-1423).
 * A file that names its own today cannot go stale that way.
 *
 * Only `Date` is faked. The screenshot matcher polls on real timers and MUI's transitions need them,
 * so freezing those hangs the capture rather than steadying it.
 *
 * Call it at the top of the file, above the fixtures. A fixture built from absolute dates does not
 * read the clock, so it does not matter that the hook fires after the module is evaluated — but one
 * built from `Date.now()` does: build it from the returned instant instead, or inside a test.
 *
 * A component that reads the clock when its own module loads (a constant at module scope, an atom
 * whose initial value is computed from `new Date()`) has read it before any `beforeAll`, so this hook
 * is too late for it: freeze it with {@link freezeClockNow} instead, or read the clock lazily.
 *
 * @param day the frozen day as `yyyy-MM-dd`
 * @returns the frozen instant in milliseconds, for fixtures that count back from "now".
 */
export const freezeClockAt = (day: string) => {
  const frozen = middayOf(day)

  beforeAll(() => {
    vi.useFakeTimers({ now: frozen, toFake: ['Date'] })
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  return frozen
}

/**
 * The instant {@link freezeClockAt} freezes a day at, for a file that installs its own fake timers
 * (`vi.useFakeTimers({ now: frozenInstant(day) })`) and needs the same instant.
 */
export const frozenInstant = (day: string) => middayOf(day)

/**
 * Freezes the clock at once; see {@link freezeClockAt} for when. Call it from `vi.hoisted`, which runs
 * before the file's imports are evaluated; the helper comes in through a dynamic import there:
 *
 *     await vi.hoisted(async () => {
 *       const { freezeClockNow } = await import('../test-utils/freezeClock')
 *       freezeClockNow('2026-10-07')
 *     })
 *
 * The visual setup file has already loaded `@date-fns/tz` with the real `Date` by then, so TZDate
 * keeps formatting in Helsinki under the fake. Assert something the frozen day decides (the selected
 * year) before the capture, so a wrong day fails the test rather than slipping under the screenshot
 * tolerance.
 *
 * @param day the frozen day as `yyyy-MM-dd`
 * @returns the frozen instant in milliseconds.
 */
export const freezeClockNow = (day: string) => {
  const frozen = middayOf(day)
  vi.useFakeTimers({ now: frozen, toFake: ['Date'] })

  afterAll(() => {
    vi.useRealTimers()
  })

  return frozen
}
