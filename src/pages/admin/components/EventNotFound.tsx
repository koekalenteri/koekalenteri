import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { Path } from '../../../routeConfig'

import FullPageFlex from './FullPageFlex'

interface EventNotFoundProps {
  eventId?: string
}

const EventNotFound = ({ eventId }: EventNotFoundProps) => {
  const { t } = useTranslation()

  return (
    <FullPageFlex>
      <Stack
        direction="column"
        spacing={4}
        alignItems="center"
        justifyContent="center"
        sx={{ height: '100%', width: '100%', p: 4 }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            maxWidth: 600,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <ErrorOutlineIcon color="error" sx={{ fontSize: 64, mb: 2 }} />

          <Typography variant="h4" component="h1" gutterBottom>
            {t('error.eventNotFound')}
          </Typography>

          {eventId && (
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {t('error.eventWithIdNotFound', { id: eventId })}
            </Typography>
          )}

          <Typography variant="body1" sx={{ mt: 2, mb: 4 }}>
            {t('error.eventMayHaveBeenDeleted')}
          </Typography>

          <Button component={Link} to={Path.admin.events} variant="contained" startIcon={<ArrowBackIcon />}>
            {t('backToEventsList')}
          </Button>
        </Paper>
      </Stack>
    </FullPageFlex>
  )
}

export default EventNotFound
