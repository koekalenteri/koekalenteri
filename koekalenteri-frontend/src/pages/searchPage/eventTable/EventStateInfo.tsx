import { useTranslation } from 'react-i18next'
import { Box } from '@mui/material'
import { EventState } from 'koekalenteri-shared/model'

export function EventStateInfo({ state }: { state: EventState }) {
  const { t } = useTranslation()
  const showInfo = state === 'tentative' || state === 'cancelled'
  return (
    <Box sx={{ color: 'warning.main', textTransform: 'uppercase', mr: 1 }}>
      {showInfo && t(`event.states.${state}_info`)}
    </Box>
  )
}
