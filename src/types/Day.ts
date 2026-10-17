declare const dayKeyBrand: unique symbol

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/**
 * A calendar day with no zone, as `yyyy-MM-dd`: the day a trial runs, an entry opens or closes, a
 * dog is placed on. It is not a moment; the moments a day starts and ends depend on the zone, and
 * only `src/lib/day.ts` turns one into the other (KOE-1545).
 *
 * The type takes a literal of the right shape (`'2026-10-17'`, a `RuleDate`) and refuses a plain
 * `string`, an instant and a key with an unpadded month, so a value typed `DayKey` compares and sorts
 * as text. `isDayKey` (src/lib/day.ts) narrows what comes in from storage or a URL; `toDayKey` builds
 * one from parts.
 */
export type DayKey = `${number}-${'0' | '1'}${Digit}-${'0' | '1' | '2' | '3'}${Digit}` & {
  readonly [dayKeyBrand]?: never
}
