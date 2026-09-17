import { TZDate } from '@date-fns/tz'
import { TIME_ZONE } from '@/i18n/dates'

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
 * built from `Date.now()` does, and belongs inside a test rather than at module scope.
 *
 * @param day the frozen day as `yyyy-MM-dd`; midday, so no time zone lands it on a neighbour.
 */
export const freezeClockAt = (day: string) => {
  const frozen = new TZDate(`${day}T12:00:00`, TIME_ZONE).getTime()

  beforeAll(() => {
    vi.useFakeTimers({ now: frozen, toFake: ['Date'] })
  })

  afterAll(() => {
    vi.useRealTimers()
  })
}
