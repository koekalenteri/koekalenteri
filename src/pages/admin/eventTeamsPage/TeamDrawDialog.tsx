import type { EventTeam } from '@/types'
import type { TeamDrawPlan } from './useMoveTeam'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { AsyncButton } from '../../components/AsyncButton'

interface Props {
  readonly plan?: TeamDrawPlan
  readonly teams: readonly EventTeam[]
  readonly onCancel: () => void
  readonly onConfirm: () => Promise<void>
}

/**
 * The draw, asked about as a whole before any dog moves (KOE-1722): the teams drawn, first teams first,
 * each with the dogs that move to the participants; the dogs that are mailed their place; and the teams
 * drawn that are passed, as they fit no day of their dogs or their class takes no move.
 */
export default function TeamDrawDialog({ plan, teams, onCancel, onConfirm }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const teamName = (index: number) => {
    const heading = t('teams.team', { number: index + 1 })
    const name = teams[index]?.name
    return name ? `${heading}: ${name}` : heading
  }

  return (
    <Dialog open={!!plan} onClose={onCancel} aria-labelledby={titleId} maxWidth="sm" fullWidth>
      <DialogTitle id={titleId}>{t('teams.drawTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('teams.drawInfo')}</DialogContentText>
        {plan?.drawn.length ? (
          <>
            <Typography variant="subtitle2" component="h3" sx={{ mt: 2 }}>
              {t('teams.drawDrawn')}
            </Typography>
            <List dense disablePadding>
              {plan.drawn.map(({ dogs, team }) => (
                <ListItem key={team} disableGutters>
                  <ListItemText primary={teamName(team)} secondary={dogs.join(', ')} />
                </ListItem>
              ))}
            </List>
          </>
        ) : (
          <DialogContentText sx={{ mt: 2 }}>{t('teams.drawNone')}</DialogContentText>
        )}
        {!!plan?.messaged.length && (
          <DialogContentText
            sx={{ mt: 1 }}
          >{`${t('teams.drawMessaged')}: ${plan.messaged.join(', ')}`}</DialogContentText>
        )}
        {!!plan?.passed.length && (
          <DialogContentText sx={{ mt: 1 }}>
            {`${t('teams.drawPassed')}: ${plan.passed.map(teamName).join(', ')}`}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('cancel')}</Button>
        <AsyncButton disabled={!plan?.moves.length} onClick={onConfirm} variant="contained">
          {t('teams.drawConfirm')}
        </AsyncButton>
      </DialogActions>
    </Dialog>
  )
}
