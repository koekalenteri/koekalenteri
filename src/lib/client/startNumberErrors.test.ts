import { APIError } from '@/api/http'
import { refusalCode, refusedStartNumber } from './startNumberErrors'

/** A 422 as the API layer hands it on: the parsed body, whatever shape it came in. */
const refusal = (body: Record<string, unknown> | string) => new APIError(new Response(null, { status: 422 }), body)

describe('refusalCode', () => {
  // One reading for every structured refusal, so a screen that only needs to know which one it is
  // does not grow its own copy of the check (KOE-1267).
  it('reads the code a structured refusal carries', () => {
    expect(refusalCode(refusal({ error: 'startNumbersIncomplete', message: 'missing 1' }))).toBe(
      'startNumbersIncomplete'
    )
  })

  it.each([
    ['a body that is not an object', refusal('nope')],
    ['a body with no code', refusal({ message: 'no code here' })],
    ['anything that is not an API error', new Error('offline')],
  ])('has nothing to say about %s', (_name, error) => {
    expect(refusalCode(error)).toBeUndefined()
  })
})

describe('refusedStartNumber', () => {
  /**
   * The case the ticket is about: the sheet on screen is one class, and the dog holding the number
   * is in another. Saying which class is what makes the refusal act-on-able (KOE-1267).
   */
  it('names the number and the class holding it', () => {
    expect(refusedStartNumber(refusal({ error: 'startNumberTaken', eventClass: 'AVO', number: 3 }))).toEqual({
      key: 'startNumbers.takenInClass',
      values: { eventClass: 'AVO', number: 3 },
    })
  })

  it('still names the number when the holder has no class of its own', () => {
    expect(refusedStartNumber(refusal({ error: 'startNumberTaken', number: 7 }))).toEqual({
      key: 'startNumbers.taken',
      values: { number: 7 },
    })
  })

  it.each([
    ['startNumberAssignedTwice', 'startNumbers.assignedTwice'],
    ['startNumberOutsideClass', 'startNumbers.outsideClass'],
  ])('turns %s into its own sentence', (error, key) => {
    expect(refusedStartNumber(refusal({ error, number: 5 }))).toEqual({ key, values: { number: 5 } })
  })

  it.each([
    ['a refusal it does not know', refusal({ error: 'somethingElse' })],
    ['a body that is not an object', refusal('nope')],
    ['anything that is not an API error', new Error('offline')],
  ])('falls back to the plain failure for %s', (_name, error) => {
    expect(refusedStartNumber(error)).toEqual({ key: 'startNumbers.saveFailed', values: {} })
  })
})
