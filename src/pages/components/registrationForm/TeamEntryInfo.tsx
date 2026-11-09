import type { ChangeEvent } from 'react'
import type { TeamEntry } from '@/types'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalState } from '@/hooks/useLocalState'
import CollapsibleSection from '../CollapsibleSection'

interface Props {
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly teamEntry?: TeamEntry
  /** The team as the registrant names it, or none once the name is cleared. */
  readonly onChange: (teamEntry: TeamEntry | undefined) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

/** The team a name and a mark make: none without a name, and the mark only where it is set. */
const teamOf = (name: string, primary: boolean): TeamEntry | undefined =>
  name.trim() ? { name, ...(primary ? { primary: true } : {}) } : undefined

/**
 * The team the dog runs in (KOE-1721), where the event asks for one at entry: the team's name as the
 * club or the kennel gave it, and whether it is their first team. Naming a team is optional; the save
 * holds the name to the same rule as the form (`entryTeamError`).
 */
export function TeamEntryInfo({ disabled, error, helperText, teamEntry, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const primary = !!teamEntry?.primary

  const [name, setName] = useLocalState(teamEntry?.name ?? '', (value) => onChange(teamOf(value, primary)))

  const handlePrimary = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => onChange(teamOf(name, checked)),
    [name, onChange]
  )

  return (
    <CollapsibleSection
      title={t('registration.teamEntry')}
      error={error}
      helperText={helperText ?? teamEntry?.name ?? ''}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Stack spacing={1}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('registration.teamEntryInfo')}
        </Typography>
        <TextField
          disabled={disabled}
          error={error}
          label={t('registration.teamEntryName')}
          name="teamEntryName"
          onChange={(e) => setName(e.target.value)}
          sx={{ maxWidth: 480 }}
          value={name}
        />
        <FormControlLabel
          control={<Checkbox checked={primary} disabled={disabled || !name.trim()} onChange={handlePrimary} />}
          label={t('registration.teamEntryPrimary')}
        />
      </Stack>
    </CollapsibleSection>
  )
}
