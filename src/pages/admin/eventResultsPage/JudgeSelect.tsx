import type { PublicJudge } from '../../../types'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

interface Props {
  /** The judges the class or event names. */
  readonly judges: PublicJudge[]
  readonly value?: PublicJudge
  readonly disabled?: boolean
  readonly onChange: (judge?: PublicJudge) => void
}

/**
 * Who judged the dog, for event types with no posts to hang the question on.
 *
 * The same two shapes a post's judge control has: one judge is a fact to state, not a choice to offer,
 * and several is a choice where the previous dog's judge is the likely answer for the next.
 */
export const JudgeSelect = ({ judges, value, disabled, onChange }: Props) => {
  const { t } = useTranslation()

  if (judges.length === 1) {
    return (
      <Typography variant="caption" color="text.secondary">
        {judges[0].name}
      </Typography>
    )
  }

  if (judges.length < 2) return null

  return (
    <TextField
      disabled={disabled}
      label={t('results.judge')}
      onChange={(event) => onChange(judges.find((candidate) => String(candidate.id) === event.target.value))}
      select
      size="small"
      sx={{ minWidth: 150 }}
      value={value ? String(value.id) : ''}
    >
      {judges.map((candidate) => (
        <MenuItem key={candidate.id} value={String(candidate.id)}>
          {candidate.name}
        </MenuItem>
      ))}
    </TextField>
  )
}
