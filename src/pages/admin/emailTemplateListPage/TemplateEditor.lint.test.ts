import { getLintSource } from './TemplateEditor.lint'

describe('TemplateEditor.lint', () => {
  const schema = {
    event: {
      date: '2026-01-01',
      name: 'x',
    },
  }

  const makeView = (text: string) =>
    ({
      state: {
        doc: {
          toString: () => text,
        },
      },
    }) as any

  it('does not lint identifier-like text inside string literals', () => {
    const lint = getLintSource(schema)
    const diagnostics = lint(makeView('{{ "event.unknownKey" }}'))

    expect(diagnostics).toEqual([])
  })

  it('returns warning for unknown path segment', async () => {
    const lint = getLintSource(schema)
    const diagnostics = await lint(makeView('Hello {{event.unknownKey}}'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].severity).toBe('warning')
    expect(diagnostics[0].message).toContain('unknownKey')
  })
})
