import { object, optional, string } from 'valibot'
import { describe, expect, it } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { validateBody } from './request'

const schema = object({ id: string('must be a string'), note: optional(string('must be a string')) })

describe('validateBody', () => {
  it('returns the parsed body when it matches the schema', () => {
    const result = validateBody(constructAPIGwEvent({}), schema, { id: 'reg1', note: 'hello' })

    expect(result).toEqual({ data: { id: 'reg1', note: 'hello' } })
  })

  it('answers 400 with the offending field and a message built from it', () => {
    const result = validateBody(constructAPIGwEvent({}), schema, { id: 42 })

    expect(result).toEqual({ badRequest: expect.objectContaining({ statusCode: 400 }) })
    expect('badRequest' in result && JSON.parse(result.badRequest.body)).toEqual({
      errors: [{ field: 'id', message: 'must be a string' }],
      message: 'Bad request: id must be a string',
    })
  })

  it('reports every failing field, not only the first', () => {
    const result = validateBody(constructAPIGwEvent({}), schema, { id: 42, note: false })

    expect('badRequest' in result && JSON.parse(result.badRequest.body).errors).toEqual([
      { field: 'id', message: 'must be a string' },
      { field: 'note', message: 'must be a string' },
    ])
  })

  it('reports a body that is not an object without naming a field', () => {
    const result = validateBody(constructAPIGwEvent({}), schema, 'nonsense')

    expect('badRequest' in result && JSON.parse(result.badRequest.body)).toEqual({
      errors: [{ field: '', message: expect.any(String) }],
      message: expect.stringContaining('Bad request: '),
    })
  })
})
