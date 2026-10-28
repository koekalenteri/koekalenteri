/**
 * Any number a registry may have written, separators and all: what may be looked up in Kennelliitto,
 * whose own spelling is never judged ("EST48412/20", a dog it stored with a space).
 */
const RE_RegNo = /^[A-ZÖ]{1,2}[A-Z\-/ .]{0,8}[\d/-]{4,12}$/
/** The Estonian studbook's sections E, U and MA put a letter before the year (EST-12345/E20). */
const RE_EstonianSectionRegNo = /^EST-?\d{5}\/(E|U|MA)\d{2}$/
/** A number no registry below has a form for: no space and no dot. */
const RE_PlainRegNo = /^[A-ZÖ]{1,2}[A-Z\-/]{0,8}[\d/-]{4,12}$/
const RE_FinnishVeryOldRegNo = /^SF\d{5}[0-9A-Z]?\/1?8?\d{2}$/
const RE_FinnishOldRegNo = /^FIN\d{5}\/\d{2}$/
const RE_FinnishRegNo = /^(FI|ER)\d{5}\/\d{2}$/

/**
 * The form a number the user types must take, by the registry it starts with, first match wins
 * (KOE-1651). SE, DK and NO must not be followed by a letter, so SHSB, NHSB, NOCH and the old Swedish
 * S11405/2007 fall to a later row; EST, LV and LSVK match on the code alone, so "LSVKLR1234/19" gets
 * the Lithuanian message rather than passing the plain rule.
 * - SE: SKK, SE + 5 digits / year, e.g. SE11496/2019 (https://www.rasdata.nu/labrador/hund/2018/s1149619.htm,
 *   the DKK 2025 show catalogue https://www.hundeweb.dk/udstilling-katalog/udstilling/260283/search?raid=GR08).
 *   The older S prefix (https://hundar.skk.se/avelsdata/help/htmlorginal/hund/Hund_sokHund.htm) takes the plain rule.
 * - DK: DKK, DK + 5 digits with leading zeros / year, e.g. DK00060/2024 (the same catalogue).
 * - NO: NKK, NO + 5 digits / 2-digit year.
 * - EST: EKL studbook sections EST-xxxxx/xx, /Exx, /Uxx and /MAxx; the hyphen is official
 *   (https://eestihagijas.ee/index.php/tou-tutvustus/touraamat).
 * - LV: LV-LBR-1234/19. LSVK: LSVK LR 1234/19, the spaces are part of the form.
 * - The registries whose numbers carry a space or a dot keep the loose rule.
 */
const REG_NO_FORMS = [
  { error: 'SE', form: /^SE\d{5}\/\d{4}$/, prefix: /^SE(?![A-ZÖ])/ },
  { error: 'DK', form: /^DK\d{5}\/\d{4}$/, prefix: /^DK(?![A-ZÖ])/ },
  { error: 'NO', form: /^NO\d{5}\/\d{2}$/, prefix: /^NO(?![A-ZÖ])/ },
  { error: 'EST', form: /^EST-\d{5}\/(E|U|MA)?\d{2}$/, prefix: /^EST/ },
  { error: 'LV', form: /^LV-[A-Z]{3}-\d{4,5}\/\d{2}$/, prefix: /^LV/ },
  { error: 'LSVK', form: /^LSVK [A-Z]{2,3} \d{4,5}\/\d{2}$/, prefix: /^LSVK/ },
  { error: 'invalid', form: RE_RegNo, prefix: /^(CLP|DRC|KC|LOE|LOF|MET|ÖHZB|SHSB)/ },
] as const

/** Why a typed number is not in its registry's form: the registry, or `invalid` for the plain rule. */
export type RegNoError = (typeof REG_NO_FORMS)[number]['error']

/**
 * Why a number the user types for a dog entered by hand is not in its registry's form, or undefined
 * when it is (KOE-1651). Nothing changes the number; the edges are trimmed before it gets here.
 */
export const regNoError = (input: string): RegNoError | undefined => {
  const row = REG_NO_FORMS.find(({ prefix }) => prefix.test(input))
  if (row) return row.form.test(input) ? undefined : row.error
  return RE_PlainRegNo.test(input) ? undefined : 'invalid'
}

/**
 * Whether a number can be looked up: any spelling a registry or Kennelliitto may have, which is
 * looser than `regNoError`. A dog Kennelliitto knows is never judged by its number.
 */
export const validateRegNo = (input: string): boolean => RE_RegNo.test(input) || RE_EstonianSectionRegNo.test(input)

export const isFinnishRegNo = (regNo: string): boolean =>
  RE_FinnishRegNo.test(regNo) || RE_FinnishOldRegNo.test(regNo) || RE_FinnishVeryOldRegNo.test(regNo)

export const isModernFinnishRegNo = (regNo: string): boolean => RE_FinnishRegNo.test(regNo)

/**
 * A registration number Kennelliitto keeps as a Finnish one: its registries (FI, FIN, ER, EJ) and the
 * old SF numbers. Stored numbers may carry the separators the form let in before KOE-1651, and
 * Kennelliitto's own spelling is never judged, so separators between the prefix and the digits are skipped. Only a number that is not domestic can be a foreign dog that
 * Kennelliitto does not know yet (KOE-1201), and Koira/Ulkomainen refuses FI, ER and EJ in any case.
 * `isFinnishRegNo` is not used here because it rejects typed separators and lengths other than the
 * canonical ones, and a Finnish-looking number must never be looked up or added as foreign, whatever its shape.
 */
export const isKcDomesticRegNo = (regNo: string): boolean => /^(FIN?|ER|EJ|SF)[ .\-/]*\d/i.test(regNo.trim())
