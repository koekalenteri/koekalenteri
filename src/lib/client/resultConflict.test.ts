import { APIError } from '@/api/http'
import { isStoredEventResult, resultConflictResponse } from './resultConflict'

const refused = (status: number, body: ConstructorParameters<typeof APIError>[1]) =>
  new APIError(new Response(null, { status }), body)
const at = '2026-09-12T10:00:00.000Z'
const version = { tasks: [{ exercise: 1, part: 0, points: 15, updatedAt: at }], updatedAt: at }

describe('resultConflictResponse', () => {
  it('makes the dates of the raw JSON a 409 carries', () => {
    const answer = resultConflictResponse(
      refused(409, {
        conflicts: [{ id: 'dog', stored: version, submitted: version }],
        error: 'resultConflict',
        saved: [{ eventResult: version, id: 'other' }],
        unchanged: [],
      })
    )

    expect(answer?.conflicts[0].stored.updatedAt).toEqual(new Date(at))
    expect(answer?.conflicts[0].stored.tasks?.[0].updatedAt).toEqual(new Date(at))
    expect(answer?.saved[0].eventResult.updatedAt).toEqual(new Date(at))
  })

  it.each([
    ['the other 409, a changed running order', refused(409, { error: 'staleData', message: 'changed' })],
    ['a 409 that names nothing', refused(409, 'conflict')],
    ['a body with a part missing', refused(409, { conflicts: [], saved: [] })],
    ['another status', refused(423, { conflicts: [], saved: [], unchanged: [] })],
    ['an error that is no answer', new Error('Network Error')],
  ])('takes %s for no conflict', (_name, error) => {
    expect(resultConflictResponse(error)).toBeUndefined()
  })
})

describe('isStoredEventResult', () => {
  it('tells a version with its writer from one off a link, which has none', () => {
    const updatedAt = new Date(at)

    expect(isStoredEventResult({ eventResult: { updatedAt, updatedBy: 'Sihteeri' }, id: 'dog' })).toBe(true)
    expect(isStoredEventResult({ eventResult: { updatedAt }, id: 'dog' })).toBe(false)
  })
})
