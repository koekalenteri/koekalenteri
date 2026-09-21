import type { EmailTemplate } from '@/types'
import { openLintPanel } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { TemplateEditor } from './TemplateEditor'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', minHeight: 160, padding: 16, width: 800 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The editor reads only the language fields; the partial template converts at this boundary.
const template = (fi: string) => ({ en: '', fi }) as unknown as EmailTemplate

// A field the receipt does not have, and a block closed with the wrong tag: one warning, one error.
const source = 'Hei {{reg.dog.name}}!\nKoe: {{event.unknownKey}}\n{{#if reg.notes}}\n{{reg.notes}}\n{{/each}}'

const renderEditor = async () => {
  const screen = await render(
    <Frame>
      <TemplateEditor templateId="receipt" template={template(source)} language="fi" />
    </Frame>
  )
  await expect.element(screen.getByText('unknownKey')).toBeVisible()
  await expect.poll(() => document.querySelectorAll('.cm-lintRange').length).toBe(2)
  return screen
}

// The marks in the text and the gutter, in the severity's colour, dark enough to see (KOE-1434).
it('marks an unknown field and a syntax error in the text and the gutter', async () => {
  const screen = await renderEditor()

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('template-editor-lint')
})

// The same two findings as the diagnostics panel, the list a screen reader reads and the keyboard
// walks; Mod-Shift-M opens it. The panel is what the accessibility audit of this capture measures.
it('lists the findings in the diagnostics panel', async () => {
  const screen = await renderEditor()
  const editor = document.querySelector('.cm-editor')
  const view = editor && EditorView.findFromDOM(editor instanceof HTMLElement ? editor : document.body)
  if (!view) throw new Error('no editor view')
  openLintPanel(view)

  await expect.element(screen.getByRole('listbox', { name: 'Diagnostics' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('template-editor-lint-panel')
})
