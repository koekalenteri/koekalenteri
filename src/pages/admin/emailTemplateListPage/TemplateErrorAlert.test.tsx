import { render, screen } from '@testing-library/react'
import { TemplateErrorAlert } from './TemplateErrorAlert'

describe('TemplateErrorAlert', () => {
  it.each([
    [
      'a syntax error with its column',
      { column: 4, language: 'fi' as const, line: 3, message: "if doesn't match each" },
      'templateEditor.errorAtColumn',
    ],
    [
      'a syntax error the parser only knows the line of',
      { language: 'en' as const, line: 7, message: 'Too many closing braces' },
      'templateEditor.errorOnLine',
    ],
    [
      'a rejection with no line',
      { language: 'fi' as const, message: '#if requires exactly one argument' },
      'templateEditor.rejected',
    ],
    ['a failure with no language', { message: 'missing token' }, 'templateEditor.saveFailed'],
  ])('says %s', (_name, error, key) => {
    render(<TemplateErrorAlert error={error} />)

    expect(screen.getByRole('alert')).toHaveTextContent(key)
  })
})
