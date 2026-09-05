import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import FormatListBulleted from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import MailOutline from '@mui/icons-material/MailOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Path } from '../../../../routeConfig'
import { actionButtonSx, sectionSx } from './styles'

interface Props {
  readonly eventFinished: boolean
  readonly eventId: string
  readonly hasRegistrations?: boolean
  readonly onCreateRegistration?: () => void
  readonly onOpenDetails?: () => void
  readonly onSendMessage?: () => void
}

/**
 * What the panel offers apart from the trial's own steps. Scoring is a step, not a general action, so
 * defining the posts and entering the results live in the results section (KOE-1354).
 */
const EventActions = ({
  eventFinished,
  eventId,
  hasRegistrations,
  onCreateRegistration,
  onOpenDetails,
  onSendMessage,
}: Props) => {
  const { t } = useTranslation()

  return (
    <Box sx={sectionSx}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
        {t('eventManagement.actions')}
      </Typography>
      <Stack spacing={1} sx={{ p: 1 }}>
        <Button
          fullWidth
          onClick={onOpenDetails}
          startIcon={<FormatListBulleted />}
          sx={actionButtonSx}
          variant="outlined"
        >
          {t('eventManagement.showEventDetails')}
        </Button>
        <Button
          disabled={eventFinished}
          fullWidth
          onClick={onCreateRegistration}
          startIcon={<AddCircleOutline />}
          sx={actionButtonSx}
          variant="outlined"
        >
          {t('createRegistration')}
        </Button>
        <Button
          disabled={!hasRegistrations}
          fullWidth
          onClick={onSendMessage}
          startIcon={<MailOutline />}
          sx={actionButtonSx}
          variant="outlined"
        >
          {t('eventManagement.message.action')}
        </Button>
        <Button
          fullWidth
          href={Path.admin.startList(eventId)}
          startIcon={<FormatListNumberedOutlined />}
          sx={actionButtonSx}
          target="_blank"
          variant="outlined"
        >
          {t('eventManagement.startList.secretary')}
        </Button>
      </Stack>
    </Box>
  )
}

export default EventActions
