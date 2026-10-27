const RE_RegNo = /^[A-ZÖ]{1,2}[A-Z\-/ .]{0,8}[\d/-]{4,12}$/
const RE_FinnishVeryOldRegNo = /^SF\d{5}[0-9A-Z]?\/1?8?\d{2}$/
const RE_FinnishOldRegNo = /^FIN\d{5}\/\d{2}$/
const RE_FinnishRegNo = /^(FI|ER)\d{5}\/\d{2}$/

export const validateRegNo = (input: string): boolean => RE_RegNo.test(input)

export const isFinnishRegNo = (regNo: string): boolean =>
  RE_FinnishRegNo.test(regNo) || RE_FinnishOldRegNo.test(regNo) || RE_FinnishVeryOldRegNo.test(regNo)

export const isModernFinnishRegNo = (regNo: string): boolean => RE_FinnishRegNo.test(regNo)

/**
 * A registration number Kennelliitto keeps as a Finnish one: its registries (FI, FIN, ER, EJ) and the
 * old SF numbers. Nothing normalises a typed number, so the separators `validateRegNo` lets in between
 * the prefix and the digits are skipped. Only a number that is not domestic can be a foreign dog that
 * Kennelliitto does not know yet (KOE-1201), and Koira/Ulkomainen refuses FI, ER and EJ in any case.
 */
export const isKcDomesticRegNo = (regNo: string): boolean => /^(FIN?|ER|EJ|SF)[ .\-/]*\d/i.test(regNo.trim())
