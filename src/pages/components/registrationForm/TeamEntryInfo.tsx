import type { TeamEntry } from '@/types'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
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

/** The team a name makes: none without one. */
const teamOf = (name: string): TeamEntry | undefined => (name.trim() ? { name } : undefined)

/**
 * The team the dog runs in (KOE-1721), where the event asks for one at entry: the team's name as the
 * club or the kennel gave it. Naming a team is optional; the save holds the name to the same rule as the
 * form (`entryTeamError`). The secretary marks a club's first team on the teams page (KOE-1759).
 */
export function TeamEntryInfo({ disabled, error, helperText, teamEntry, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()

  const [name, setName] = useLocalState(teamEntry?.name ?? '', (value) => onChange(teamOf(value)))

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
      </Stack>
    </CollapsibleSection>
  )
}
