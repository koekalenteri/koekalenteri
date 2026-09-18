import { APIError } from '@/api/http'
import { isObject } from '../utils'

type RefusedNumberKey =
  | 'startNumbers.assignedTwice'
  | 'startNumbers.outsideClass'
  | 'startNumbers.saveFailed'
  | 'startNumbers.taken'
  | 'startNumbers.takenInClass'

interface RefusedNumber {
  /** What to tell the person at the sheet. */
  key: RefusedNumberKey
  /** What that sentence needs: the number refused, and the class holding it where one is known. */
  values: { eventClass?: string; number?: number }
}

const FALLBACK: RefusedNumber = { key: 'startNumbers.saveFailed', values: {} }

/**
 * What to say when a draw will not save.
 *
 * The server knows exactly which number it refused and why, and until KOE-1267 none of that reached
 * the screen: a class secretary saw "check the numbers and try again" over a sheet where every
 * number was fine, because the dog holding the clashing number was in another class and not on their
 * link at all. Both entry screens read the refusal through here, so neither can drift into saying
 * less than the server knows.
 */
export const refusedStartNumber = (error: unknown): RefusedNumber => {
  if (!(error instanceof APIError) || !isObject(error.body)) return FALLBACK

  const body: Record<string, unknown> = error.body
  const eventClass = typeof body.eventClass === 'string' ? body.eventClass : undefined
  const number = typeof body.number === 'number' ? body.number : undefined
  const values = { ...(eventClass ? { eventClass } : {}), ...(number === undefined ? {} : { number }) }

  switch (body.error) {
    case 'startNumberAssignedTwice':
      return { key: 'startNumbers.assignedTwice', values }
    case 'startNumberOutsideClass':
      return { key: 'startNumbers.outsideClass', values }
    case 'startNumberTaken':
      return { key: eventClass ? 'startNumbers.takenInClass' : 'startNumbers.taken', values }
    default:
      return FALLBACK
  }
}
