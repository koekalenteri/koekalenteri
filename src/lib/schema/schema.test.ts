import type { GenericSchema } from 'valibot'
import { describe, expect, it } from 'vitest'
import * as eventFixtures from '../../__mockData__/events'
import * as registrationFixtures from '../../__mockData__/registrations'
import { summarizeFieldErrors, validate } from './common'
import { eventBodySchema } from './event'
import { paymentCreateSchema } from './payment'
import { registrationBodySchema } from './registration'

/** As the value reaches a lambda: dates are strings and nothing carries a class. */
const overTheWire = (value: unknown) => JSON.parse(JSON.stringify(value))

const errorsOf = (schema: GenericSchema, input: unknown) => {
  const result = validate(schema, overTheWire(input))
  return 'errors' in result ? result.errors : []
}

/** Every exported fixture, arrays spread into their items, named so a failure says which one. */
const fixtures = (module: Record<string, unknown>): [string, unknown][] =>
  Object.entries(module).flatMap(([name, value]): [string, unknown][] =>
    Array.isArray(value) ? value.map((item, index) => [`${name}[${index}]`, item]) : [[name, value]]
  )

describe('validate', () => {
  it('names the failing field by its path through the body', () => {
    expect(errorsOf(registrationBodySchema, { dates: [{ time: 'yö' }], dog: { regNo: 42 } })).toEqual([
      { field: 'dates.0.time', message: 'must be one of: ap, ip, kp' },
      { field: 'dog.regNo', message: 'must be a string' },
    ])
  })

  it('reports a body that is not an object at all without a field', () => {
    expect(errorsOf(registrationBodySchema, 'not a registration')).toEqual([
      { field: '', message: 'must be an object' },
    ])
  })

  it('keeps the fields it was not asked about', () => {
    const result = validate(registrationBodySchema, { id: 'reg1', somethingNewer: { deep: true } })

    expect('data' in result && result.data).toEqual({ id: 'reg1', somethingNewer: { deep: true } })
  })

  it('accepts a null where a client clears a value', () => {
    expect(errorsOf(registrationBodySchema, { class: null, handler: null })).toEqual([])
  })
})

describe('summarizeFieldErrors', () => {
  it('reads as the sentence the API has always sent', () => {
    expect(summarizeFieldErrors([{ field: 'classes', message: 'must be an array' }])).toEqual(
      'classes must be an array'
    )
  })

  it('drops the empty path of a whole-body issue', () => {
    expect(summarizeFieldErrors([{ field: '', message: 'must be an object' }])).toEqual('must be an object')
  })
})

describe('registrationBodySchema', () => {
  it.each(fixtures(registrationFixtures))('accepts the %s fixture', (_name, fixture) => {
    expect(errorsOf(registrationBodySchema, fixture)).toEqual([])
  })

  it.each([
    ['dates', { dates: { 0: { date: '2026-05-16' } } }],
    ['dog.results', { dog: { results: {} } }],
    ['optionalCosts', { optionalCosts: {} }],
    ['owners', { owners: {} }],
    ['qualifyingResults', { qualifyingResults: {} }],
    ['results', { results: {} }],
  ])('rejects %s when it is an object instead of an array', (field, body) => {
    expect(errorsOf(registrationBodySchema, body)).toEqual([{ field, message: 'must be an array' }])
  })

  it('rejects a class outside the three', () => {
    expect(errorsOf(registrationBodySchema, { class: 'KVA' })).toEqual([
      { field: 'class', message: 'must be one of: ALO, AVO, VOI' },
    ])
  })
})

describe('eventBodySchema', () => {
  it.each(fixtures(eventFixtures))('accepts the %s fixture', (_name, fixture) => {
    expect(errorsOf(eventBodySchema, fixture)).toEqual([])
  })

  it.each(['classes', 'judges'])('rejects %s when it is an object instead of an array', (field) => {
    // DynamoDB marshalling produces this shape from a sparse array.
    expect(errorsOf(eventBodySchema, { [field]: { 0: { name: 'Invalid sparse array' } } })).toEqual([
      { field, message: 'must be an array' },
    ])
  })

  it('accepts a cost given either as a number or as a segmented cost object', () => {
    expect(errorsOf(eventBodySchema, { cost: 30, costMember: { normal: 25 } })).toEqual([])
  })
})

describe('paymentCreateSchema', () => {
  it('accepts the two ids it needs', () => {
    expect(errorsOf(paymentCreateSchema, { eventId: 'event1', registrationId: 'reg1' })).toEqual([])
  })

  it.each([{}, { eventId: '', registrationId: '' }, { eventId: 'event1' }, { registrationId: 'reg1' }])(
    'rejects %p, naming every id that is missing or empty',
    (body) => {
      const errors = errorsOf(paymentCreateSchema, body)

      expect(errors.length).toBeGreaterThan(0)
      expect(errors.every(({ message }) => message === 'is required')).toBe(true)
    }
  )
})
