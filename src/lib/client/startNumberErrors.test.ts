import { APIError } from '@/api/http'
import { refusedStartNumber } from './startNumberErrors'

/** A 422 as the API layer hands it on: the parsed body, whatever shape it came in. */
const refusal = (body: Record<string, unknown> | string) => new APIError(new Response(null, { status: 422 }), body)

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
