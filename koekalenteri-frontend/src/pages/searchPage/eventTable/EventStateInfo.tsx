import { useTranslation } from 'react-i18next'
import { Box } from '@mui/material'
import { EventState } from 'koekalenteri-shared/model'

export function EventStateInfo({ state }: { state: EventState }) {
  const { t } = useTranslation()

  return (
    <Box sx={{ textTransform: 'uppercase', mr: 1 }}>
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : null}
    </Box>
  )
}
