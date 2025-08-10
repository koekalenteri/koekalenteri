import type { EmailTemplate, EmailTemplateId, Language } from '../../../types'

import { useMemo } from 'react'
import { autocompletion } from '@codemirror/autocomplete'
import { linter, lintGutter } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import Paper from '@mui/material/Paper'
import CodeMirror from '@uiw/react-codemirror'
import { handlebarsLanguage } from '@xiechao/codemirror-lang-handlebars'

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

const theme = EditorView.theme({
  '&': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '10px',
    height: '100%',
    width: '100%',
    border: '1px solid #ccc',
  },
})

export function TemplateEditor({ templateId, template, language, hidden, onChange }: Props) {
  const handleChange = (value: string) => onChange?.({ ...template, [language]: value })

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
      theme,
    ]
  }, [templateId])

  return (
    <Paper
      sx={{
        flex: 1,
        display: hidden ? 'none' : undefined,
        minHeight: 0,
      }}
      elevation={0}
    >
      <CodeMirror
        value={template?.[language]}
        onChange={handleChange}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
        indentWithTab={false}
        style={{
          height: '100%',
          width: '100%',
        }}
      />
    </Paper>
  )
}
