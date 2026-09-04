/**
 * Release switches: a feature that is built and testable on dev but held back from a release.
 *
 * Flip a switch here, not by unwiring the feature: the routes, data and tests stay in place, and
 * the next release turns it on with one line.
 */

/**
 * Whether the live view is on show (KOE-1259): the results page's link to the live entry view, the
 * public start list's live section and the calendar's Live chip. Held back from 1.11.0 at the
 * testers' request; the view, its token link and the turn endpoints stay in place.
 */
export const liveViewEnabled = false

/**
 * Whether the outcome control also asks *why* a round ended (KOE-1299): the format's hylkäävät virheet,
 * and the retirements that are not the judge's stop — an injury, a handler's own withdrawal. That is
 * still being thought through — who wants the reason, and whether the secretary reliably has it — so
 * until then the control asks one question only: did the judge stop the trial (KOE-1300).
 *
 * The vocabulary, the derivations and the write boundary already accept the whole list. Flipping this
 * turns them on; nothing else has to be rebuilt.
 */
export const outcomeReasonEnabled = false
