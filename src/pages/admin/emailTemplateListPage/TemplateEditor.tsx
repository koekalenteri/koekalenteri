import type { EmailTemplate, EmailTemplateId, Language } from '@/types'
import { autocompletion } from '@codemirror/autocomplete'
import { linter, lintGutter, lintKeymap } from '@codemirror/lint'
import { EditorView, keymap } from '@codemirror/view'
import Paper from '@mui/material/Paper'
import CodeMirror from '@uiw/react-codemirror'
import { handlebarsLanguage } from '@xiechao/codemirror-lang-handlebars'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAutocomplete } from './TemplateEditor.ac'
import { getLintSource } from './TemplateEditor.lint'
import { defaultSchema, templateSchema } from './TemplateEditor.schema'

interface Props {
  readonly templateId?: EmailTemplateId
  readonly template: EmailTemplate
  readonly language: Language
  readonly hidden?: boolean
  readonly onChange?: (template: EmailTemplate) => void
}

/** A gutter icon as the lint package draws its own, with a stroke dark enough to stand on white. */
const marker = (shape: string) =>
  `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${encodeURIComponent(shape)}</svg>')`

// The lint package marks a range with a three-pixel wavy line and the gutter with a pale icon,
// which at this font size is a smudge that does not stand out from the page (KOE-1434). A tinted
// background and a solid wavy underline in the severity's colour make the mark a mark.
const theme = EditorView.theme({
  '.cm-lint-marker-error': {
    content: marker('<circle cx="20" cy="20" r="15" fill="#e53935" stroke="#8e0000" stroke-width="6"/>'),
  },
  '.cm-lint-marker-warning': {
    content: marker(
      '<path fill="#ffb300" stroke="#8a5a00" stroke-width="6" stroke-linejoin="round" d="M20 6L37 35L3 35Z"/>'
    ),
  },
  '.cm-lintRange': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy',
    textDecorationThickness: '1.5px',
    textUnderlineOffset: '2px',
  },
  '.cm-lintRange-error': {
    backgroundColor: 'rgba(229, 57, 53, 0.18)',
    textDecorationColor: '#c62828',
  },
  '.cm-lintRange-warning': {
    backgroundColor: 'rgba(255, 179, 0, 0.28)',
    textDecorationColor: '#b26a00',
  },
  '&': {
    border: '1px solid #ccc',
    // Liberation Mono is named because the generic `monospace` is a different font on the two
    // Linux machines that compare this editor's screenshots: the Playwright image has no DejaVu
    // and falls to Liberation Mono, the CI runner has DejaVu and prefers it. Both have Liberation
    // Mono, which Playwright installs with its dependencies. A Mac never gets past Menlo.
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, 'Liberation Mono', monospace",
    fontSize: '10px',
    height: '100%',
    width: '100%',
  },
})

export function TemplateEditor({ templateId, template, language, hidden, onChange }: Props) {
  const { t } = useTranslation()
  const handleChange = (value: string) => onChange?.({ ...template, [language]: value })
  const label = t(`templateEditor.editor.${language}`)

  const extensions = useMemo(() => {
    const schema = (templateId && templateSchema[templateId]) ?? defaultSchema

    return [
      handlebarsLanguage,
      handlebarsLanguage.data.of({
        autocomplete: getAutocomplete(schema),
      }),
      autocompletion({ activateOnTyping: true }),
      linter(getLintSource(schema), { delay: 250 }),
      lintGutter(),
      // Mod-Shift-M opens the diagnostics panel: the marks in the text are a picture, the panel is a
      // list a screen reader can read and the keyboard can walk.
      keymap.of(lintKeymap),
      // The editable content is a textbox with no name of its own; a screen reader announces this.
      EditorView.contentAttributes.of({ 'aria-label': label }),
      theme,
    ]
  }, [label, templateId])

  return (
    <Paper
      sx={{
        display: hidden ? 'none' : undefined,
        flex: 1,
        minHeight: 0,
      }}
      elevation={0}
    >
      <CodeMirror
        value={template?.[language]}
        onChange={handleChange}
        extensions={extensions}
        basicSetup={{ foldGutter: true, lineNumbers: true }}
        indentWithTab={false}
        style={{
          height: '100%',
          width: '100%',
        }}
      />
    </Paper>
  )
}
