import type { Person } from '../types'
import { matchIsValidTel } from 'mui-tel-input'
import { validEmail } from './email'

const RE_RegNo = /^[A-ZÖ]{1,2}[A-Z\-/ .]{0,8}[\d/-]{4,12}$/
const RE_FinnishVeryOldRegNo = /^SF\d{5}[0-9A-Z]?\/1?8?\d{2}$/
const RE_FinnishOldRegNo = /^FIN\d{5}\/\d{2}$/
const RE_FinnishRegNo = /^(FI|ER)\d{5}\/\d{2}$/

export const validateRegNo = (input: string): boolean => RE_RegNo.test(input)

export const isFinnishRegNo = (regNo: string): boolean =>
  RE_FinnishRegNo.test(regNo) || RE_FinnishOldRegNo.test(regNo) || RE_FinnishVeryOldRegNo.test(regNo)

export const isModernFinnishRegNo = (regNo: string): boolean => RE_FinnishRegNo.test(regNo)

export function validatePerson(person: Person | undefined, location = true) {
  if (!person?.email || !person.name || !person.phone || (location && !person.location)) {
    return 'required'
  }
  if (!validEmail(person.email)) return 'email'
  if (!matchIsValidTel(person.phone)) {
    console.error('invalid phone: ', person.phone)
    return 'phone'
  }

  return false
}
