import type { EmailTemplateError } from '@/types'
import Alert from '@mui/material/Alert'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly error: EmailTemplateError
}

/**
 * Why the template was not saved, under the editor where the author is looking: which language's
 * template, the line and column when Handlebars knows them, and the reason in its own words.
 */
export const TemplateErrorAlert = ({ error }: Props) => {
  const { t } = useTranslation()
  const { column, language, line, message } = error

  let text = t('templateEditor.saveFailed', { message })
  if (language) {
    const template = t(`templateEditor.template.${language}`)
    if (line === undefined) {
      text = t('templateEditor.rejected', { message, template })
    } else if (column === undefined) {
      text = t('templateEditor.errorOnLine', { line, message, template })
    } else {
      text = t('templateEditor.errorAtColumn', { column: column + 1, line, message, template })
    }
  }

  return (
    <Alert severity="error" sx={{ mt: 1 }}>
      {text}
    </Alert>
  )
}
