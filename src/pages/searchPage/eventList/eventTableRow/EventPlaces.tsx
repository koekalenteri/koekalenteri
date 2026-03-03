import type { PublicDogEvent } from '../../../../types'
import Box from '@mui/material/Box'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isEntryOpen } from '../../../../lib/utils'

export const EventPlaces = ({ event }: { event: PublicDogEvent }) => {
  const { t } = useTranslation()

  const text = useMemo(() => {
    if (event.places) {
      if (event.entries || isEntryOpen(event)) {
        return `${event.entries ?? 0} / ${event.places}`
      }
      return `${event.places} ${t('toltaPlaces')}`
    }
    return ''
  }, [event, t])

  return <Box textAlign="right">{text}</Box>
}
