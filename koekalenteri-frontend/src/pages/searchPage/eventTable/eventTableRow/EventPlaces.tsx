import type { Event } from 'koekalenteri-shared/model'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'

export const EventPlaces = ({ event }: { event: Event }) => {
  const { t } = useTranslation()

  const text = useMemo(() => {
    if (event.places) {
      if (event.entries) {
        return `${event.entries} / ${event.places}`
      }
      return event.places + ' ' + t('toltaPlaces')
    }
    return ''
  }, [event.entries, event.places, t])

  return <Box textAlign="right">{text}</Box>
}
