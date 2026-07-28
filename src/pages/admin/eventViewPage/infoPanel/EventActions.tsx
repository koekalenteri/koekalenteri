import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import FormatListBulleted from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
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
  readonly onCreateRegistration?: () => void
  readonly onOpenDetails?: () => void
}

const EventActions = ({ eventFinished, eventId, onCreateRegistration, onOpenDetails }: Props) => {
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
