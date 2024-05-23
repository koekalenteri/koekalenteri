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

export type MinimalEvent = Pick<PublicDogEvent, 'classes' | 'startDate' | 'entries' | 'places' | 'members'>

export const EventClassPlaces = ({ event, eventClass }: { event: MinimalEvent; eventClass: string }) => {
  const { t } = useTranslation()

  const classes = event.classes.filter((c) => c.class === eventClass)

  const dates = classes.map((c) => c.date ?? event.startDate ?? new Date())
  const entryStatus = useMemo(() => {
    const status = classes.reduce(
      (acc, c) => {
        acc.places += c.places ?? 0

        // entries and members are already summarized per class
        acc.entries = c.entries ?? 0
        acc.members = c.members ?? 0
        return acc
      },
      { entries: 0, places: 0, members: 0 }
    )

    if (event.classes.length <= 1) {
      status.places = event.places

      status.entries = event.entries ?? status.entries
      status.members = event.members ?? 0
    }
    return status
  }, [classes, event.classes.length, event.entries, event.members, event.places])

  return (
    <Grid container>
      <TextGrid item xs={dates.length ? 2 : 6}>
        {eventClass}
      </TextGrid>
      {dates.length ? (
        <TextGrid item xs={4}>
          {dates.map((date) => t('dateFormat.wdshort', { date })).join(', ')}
        </TextGrid>
      ) : null}
      <NumberGrid item xs={2}>
        {entryStatus.entries}
      </NumberGrid>
      <NumberGrid item xs={2}>
        {entryStatus.places}
      </NumberGrid>
      <NumberGrid item xs={2}>
        {entryStatus.members}
      </NumberGrid>
    </Grid>
  )
}
