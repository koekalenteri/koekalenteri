import { jest } from '@jest/globals'
import { parseJSONWithFallback } from './json'

describe('parseJSONWithFallback', () => {
  it.each([undefined, null, NaN, 0, false, true, ''])('should fallback with %p', (json) => {
    expect(parseJSONWithFallback(json, 'kissa')).toEqual('kissa')
    expect(parseJSONWithFallback(json)).toEqual({})
  })

  it('should log and fallback with invalid json string', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => null)

    expect(parseJSONWithFallback('koira', ['kissa'])).toEqual(['kissa'])

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
  })

  it('should parse valid json', () => {
    expect(parseJSONWithFallback('{ "property": "value" }')).toEqual({ property: 'value' })
  })
})
