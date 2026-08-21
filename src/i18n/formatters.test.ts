import type { i18n } from 'i18next'
import { registerFormatters } from './formatters'

describe('registerFormatters', () => {
  it('formats a Finnish short datetime with a two-letter weekday', () => {
    let format: (date: Date, language: string) => string = () => ''
    const add = vi.fn((name, formatter) => {
      if (name === 'dtshort2') format = formatter
    })
    registerFormatters({ services: { formatter: { add } } } as unknown as i18n)

    expect(add).toHaveBeenCalledWith('dtshort2', expect.any(Function))
    expect(format(new Date('2026-07-27T07:48:00Z'), 'fi')).toBe('ma 27.7. 10:48')
  })

  it('formats an English short datetime with a three-letter weekday', () => {
    let format: (date: Date, language: string) => string = () => ''
    const add = vi.fn((name, formatter) => {
      if (name === 'dtshort3') format = formatter
    })
    registerFormatters({ services: { formatter: { add } } } as unknown as i18n)

    expect(add).toHaveBeenCalledWith('dtshort3', expect.any(Function))
    expect(format(new Date('2026-07-27T07:48:00Z'), 'en')).toBe('Mon 27.7. 10:48')
  })
})
