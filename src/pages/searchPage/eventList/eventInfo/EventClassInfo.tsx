import type { PublicDogEvent } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'

export const EventClassInfo = ({ event, eventClass }: { event: PublicDogEvent; eventClass: string }) => {
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
    <Grid container px={{ xs: 1, sm: 2 }} columnSpacing={{ xs: 1, sm: 2 }}>
      <Grid
        xs={dates.length ? 2 : 7}
        textAlign="left"
        sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {eventClass}
      </Grid>
      {dates.length ? (
        <Grid xs={4.5} sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {dates.map((date) => t('dateFormat.wdshort', { date })).join(', ')}
        </Grid>
      ) : null}
      <Grid xs={2} textAlign="right">
        {entryStatus.entries} / {entryStatus.places}
      </Grid>
      <Grid
        xs={3.5}
        textAlign="right"
        sx={{ pl: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {t('members', { count: entryStatus.members })}
      </Grid>
    </Grid>
  )
}
