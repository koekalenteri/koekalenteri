import { ChangeEvent } from 'react'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { EmailTemplate, Language } from 'koekalenteri-shared/model'

interface Props {
  template: EmailTemplate
  language: Language
  hidden?: boolean
  onChange?: (template: EmailTemplate) => void
}
export function TemplateEditor({ template, language, hidden, onChange }: Props) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) =>
    onChange?.({ ...template, [language]: event.target.value })

  return (
    <Stack spacing={2} alignItems="stretch" display={hidden ? 'none' : undefined} sx={{ flex: 1 }}>
      <Paper sx={{ p: 1, flex: 1 }} elevation={0}>
        <textarea
          style={{
            border: 0,
            width: '100%',
            height: '100%',
            font: '10px monospace',
            resize: 'none',
            outlineColor: 'black',
          }}
          wrap="off"
          spellCheck={false}
          value={template?.[language]}
          onChange={handleChange}
        />
      </Paper>
    </Stack>
  )
}
