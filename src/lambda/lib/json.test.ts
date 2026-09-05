import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'
import { parseJSONWithFallback } from './json'

describe('parseJSONWithFallback', () => {
  it.each([undefined, null, NaN, 0, false, true, ''])('should fallback with %p', (json) => {
    expect(parseJSONWithFallback(json, 'kissa')).toEqual('kissa')
    expect(parseJSONWithFallback(json)).toEqual({})
  })

  it('should log and fallback with invalid json string', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => null)

    expect(parseJSONWithFallback('koira', ['kissa'])).toEqual(['kissa'])

    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ name: 'SyntaxError' }),
        message: 'failed to parse json, using fallback',
      }),
    ])
  })

  it('should parse valid json', () => {
    expect(parseJSONWithFallback('{ "property": "value" }')).toEqual({ property: 'value' })
  })
})
