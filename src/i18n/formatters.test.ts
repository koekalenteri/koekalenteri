import type { i18n } from 'i18next'
import { registerFormatters } from './formatters'

describe('registerFormatters', () => {
  it('formats a Finnish short datetime with a two-letter weekday', () => {
    const add = jest.fn()
    registerFormatters({ services: { formatter: { add } } } as unknown as i18n)
    const format = add.mock.calls.find(([name]) => name === 'dtshort2')?.[1] as (date: Date, language: string) => string

    expect(format(new Date('2026-07-27T07:48:00Z'), 'fi')).toBe('ma 27.7. 10:48')
  })

  it('formats an English short datetime with a three-letter weekday', () => {
    const add = jest.fn()
    registerFormatters({ services: { formatter: { add } } } as unknown as i18n)
    const format = add.mock.calls.find(([name]) => name === 'dtshort3')?.[1] as (date: Date, language: string) => string

    expect(format(new Date('2026-07-27T07:48:00Z'), 'en')).toBe('Mon 27.7. 10:48')
  })
})
