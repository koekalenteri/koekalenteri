import type { PublicDogEvent } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { styled } from '@mui/material'
import Grid from '@mui/material/Grid'

const TextGrid = styled(Grid)({
  paddingLeft: 4,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
const NumberGrid = styled(Grid)({ paddingRight: 4, textAlign: 'right' })

export const EventClassPlaces = ({ event, eventClass }: { event: PublicDogEvent; eventClass: string }) => {
  const { t } = useTranslation()

  const classes = event.classes.filter((c) => c.class === eventClass)

  const dates = classes.map((c) => c.date ?? event.startDate ?? new Date())
  const entryStatus = useMemo(() => {
    const status = classes.reduce(
      (acc, c) => {
        acc.entries += c.entries ?? 0
        acc.places += c.places ?? 0
        acc.members += c.members ?? 0
        return acc
      },
      { entries: 0, places: 0, members: 0 }
    )

    if (event.classes.length <= 1) {
      status.entries = event.entries ?? status.entries
      status.places = event.places
    }
    return status
  }, [classes, event.classes.length, event.entries, event.places])

  return (
    <Grid container>
      <TextGrid xs={dates.length ? 2 : 6}>{eventClass}</TextGrid>
      {dates.length ? (
        <TextGrid xs={4}>{dates.map((date) => t('dateFormat.wdshort', { date })).join(', ')}</TextGrid>
      ) : null}
      <NumberGrid xs={2}>{entryStatus.entries}</NumberGrid>
      <NumberGrid xs={2}>{entryStatus.places}</NumberGrid>
      <NumberGrid xs={2}>{entryStatus.members}</NumberGrid>
    </Grid>
  )
}
