import type { DogEvent } from '../../../types'
import { styled } from '@mui/material'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import useEventTitle from '../../../hooks/useEventTitle'

const StateText = styled('span')({
  color: '#018786',
  marginLeft: '8px',
})

export default function Title({ event }: { readonly event: DogEvent }) {
  const { t } = useTranslation()
  const title = useEventTitle(event)

  return (
    <>
      <Typography variant="h5">
        {event.eventType}, {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}, {event.location}
      </Typography>
      <StateText>{title}</StateText>
    </>
  )
}
