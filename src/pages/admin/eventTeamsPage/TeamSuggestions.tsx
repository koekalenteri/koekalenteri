import type { TeamSuggestion } from '@/lib/client/teamAssembly'
import type { Registration } from '@/types'
import Add from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly suggestions: readonly TeamSuggestion[]
  /** The event's entries by id, to name the dogs of a suggestion by. */
  readonly entries: ReadonlyMap<string, Registration>
  readonly onTake: (suggestion: TeamSuggestion) => void
}

const dogNames = (suggestion: TeamSuggestion, entries: ReadonlyMap<string, Registration>) =>
  suggestion.registrationIds
    .map((id) => entries.get(id)?.dog)
    .map((dog) => dog?.name ?? dog?.regNo ?? '')
    .join(', ')

/**
 * The teams the page suggests (`teamSuggestions`, KOE-1721): each by its name, with its dogs and the
 * first-team mark a dog gave it, and a button that makes it a team.
 */
export default function TeamSuggestions({ suggestions, entries, onTake }: Props) {
  const { t } = useTranslation()
  if (!suggestions.length) return null

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h6" component="h2">
          {t('teams.suggestions')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('teams.suggestionsInfo')}
        </Typography>
        <List dense disablePadding>
          {suggestions.map((suggestion) => (
            <ListItem
              key={suggestion.registrationIds[0]}
              disableGutters
              secondaryAction={
                <Button
                  aria-label={t('teams.takeSuggestion', { name: suggestion.name })}
                  onClick={() => onTake(suggestion)}
                  size="small"
                  startIcon={<Add />}
                >
                  {t('teams.takeSuggestionShort')}
                </Button>
              }
              sx={{ pr: 16 }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <span>{suggestion.name}</span>
                    {suggestion.primary && <Chip label={t('teams.primary')} size="small" />}
                  </Stack>
                }
                secondary={dogNames(suggestion, entries)}
              />
            </ListItem>
          ))}
        </List>
      </Stack>
    </Paper>
  )
}
