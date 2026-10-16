import { afterAll, beforeAll, describe } from 'vitest'

const setTimeZone = (timeZone: string | undefined) => {
  if (timeZone === undefined) Reflect.deleteProperty(process.env, 'TZ')
  else process.env.TZ = timeZone
}

/**
 * The tests inside run as a browser in `timeZone` would: Node reads `process.env.TZ` again on each
 * change, so local dates (`new Date(2026, 9, 31)`, the date picker's typed values) are that zone's.
 * The machine's own zone comes back after the block. Build the values a test compares inside the
 * test, or as fixed instants, since anything made at collection time used the machine's zone.
 *
 * Node only: in a browser there is no `process.env.TZ` to set, and the visual project's
 * `process.env` is a stand-in object, so it throws there rather than run in the browser's own zone
 * under this block's title. Blocks do not nest: an inner block gives back the machine's zone, not
 * the outer block's.
 */
export const describeInTimeZone = (timeZone: string, tests: () => void): void => {
  if (!globalThis.process?.versions?.node) {
    throw new Error(
      `describeInTimeZone('${timeZone}') runs only under Node; the visual project sets the zone through Playwright (timezoneId)`
    )
  }
  describe(`in ${timeZone}`, () => {
    const systemTimeZone = process.env.TZ
    beforeAll(() => setTimeZone(timeZone))
    afterAll(() => setTimeZone(systemTimeZone))
    tests()
  })
}
