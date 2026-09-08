import { object, optional, string } from 'valibot'
import { describe, expect, it } from 'vitest'
import { validateBody } from './request'

const schema = object({ id: string('must be a string'), note: optional(string('must be a string')) })

describe('validateBody', () => {
  it('returns the parsed body when it matches the schema', () => {
    expect(validateBody(schema, { id: 'reg1', note: 'hello' })).toEqual({ id: 'reg1', note: 'hello' })
  })

  it('throws a 400 with the offending field and a message built from it', () => {
    expect(() => validateBody(schema, { id: 42 })).toThrow(
      expect.objectContaining({
        body: {
          errors: [{ field: 'id', message: 'must be a string' }],
          message: 'Bad request: id must be a string',
        },
        status: 400,
      })
    )
  })

  it('reports every failing field, not only the first', () => {
    expect(() => validateBody(schema, { id: 42, note: false })).toThrow(
      expect.objectContaining({
        body: expect.objectContaining({
          errors: [
            { field: 'id', message: 'must be a string' },
            { field: 'note', message: 'must be a string' },
          ],
        }),
      })
    )
  })

  it('reports a body that is not an object without naming a field', () => {
    expect(() => validateBody(schema, 'nonsense')).toThrow(
      expect.objectContaining({
        body: {
          errors: [{ field: '', message: expect.any(String) }],
          message: expect.stringContaining('Bad request: '),
        },
      })
    )
  })
})
