import type { EditorView } from '@uiw/react-codemirror'
import { getLintSource } from './TemplateEditor.lint'

describe('TemplateEditor.lint', () => {
  const schema = {
    event: {
      date: '2026-01-01',
      name: 'x',
    },
  }

  // The lint source reads only state.doc; the minimal view double converts at this boundary.
  const makeView = (text: string) =>
    ({
      state: {
        doc: {
          toString: () => text,
        },
      },
    }) as unknown as EditorView

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

  describe('syntax errors', () => {
    it('marks the block that is closed with the wrong tag, and the unknown field after it', async () => {
      const lint = getLintSource(schema)
      const doc = 'Hello\n{{#if event.name}}\n{{event.unknownKey}}\n{{/each}}'
      const diagnostics = await lint(makeView(doc))

      expect(diagnostics[0]).toEqual({
        from: doc.indexOf('if event'),
        message: "if doesn't match each",
        severity: 'error',
        to: doc.indexOf(' event.name'),
      })
      expect(diagnostics).toHaveLength(2)
      expect(diagnostics[1].severity).toBe('warning')
    })

    it('marks the whole line when the parser only knows the line', async () => {
      const lint = getLintSource(schema)
      const doc = 'Hello\nname: {{event.name\nbye'
      const diagnostics = await lint(makeView(doc))

      expect(diagnostics).toEqual([
        {
          from: doc.indexOf('name:'),
          message: 'Unexpected character inside {{ }}',
          severity: 'error',
          to: doc.indexOf('\nbye'),
        },
      ])
    })

    it('marks the end of the document when a block is never closed', async () => {
      const lint = getLintSource(schema)
      const doc = '{{#if event.name}}\nbye'
      const diagnostics = await lint(makeView(doc))

      expect(diagnostics).toEqual([
        {
          from: doc.indexOf('bye'),
          message: 'The template ends before a {{ }} or a block is closed',
          severity: 'error',
          to: doc.length,
        },
      ])
    })
  })
})
