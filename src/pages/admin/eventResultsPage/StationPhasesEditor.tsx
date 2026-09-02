import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly phases: readonly string[]
  readonly onSave: (phases: string[]) => Promise<unknown>
}

const SEPARATOR = ','

const parsePhases = (text: string): string[] =>
  text
    .split(SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean)

/**
 * The phases of the day at a post whose format leaves them to the post (NOME-B): one line, in order,
 * written down at the post on the day. Saved when the line is left, so a secretary types the day in
 * and moves on, and the turn controls pick the phases up from the saved post.
 */
export const StationPhasesEditor = ({ phases, onSave }: Props) => {
  const { t } = useTranslation()
  const [text, setText] = useState(phases.join(`${SEPARATOR} `))

  useEffect(() => setText(phases.join(`${SEPARATOR} `)), [phases])

  const handleBlur = () => {
    const next = parsePhases(text)
    if (next.join(SEPARATOR) !== phases.join(SEPARATOR)) void onSave(next)
  }

  return (
    <TextField
      helperText={t('liveStatus.phasesHelp')}
      label={t('liveStatus.phases')}
      onBlur={handleBlur}
      onChange={(event) => setText(event.target.value)}
      size="small"
      sx={{ minWidth: 280 }}
      value={text}
    />
  )
}
