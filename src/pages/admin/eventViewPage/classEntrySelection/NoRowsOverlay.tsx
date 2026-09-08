import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'

const NoRowsOverlay = () => {
  const { t } = useTranslation()

  return (
    <Box
      className="no-rows"
      sx={{
        alignItems: 'center',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {t('eventManagement.participantSelection.dragHere')}
    </Box>
  )
}

export default NoRowsOverlay
