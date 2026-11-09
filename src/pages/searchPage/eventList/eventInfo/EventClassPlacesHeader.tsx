import type { PublicDogEvent } from '@/types'
import Grid from '@mui/material/Grid'
import { useTranslation } from 'react-i18next'
import InfoTableHeaderText from '@/pages/components/InfoTableHeaderText'
import { classPlacesColumns } from './EventClassPlaces'

export const EventClassPlacesHeader = ({ event }: { event: PublicDogEvent }) => {
  const { t } = useTranslation()

  const columns = classPlacesColumns(event)
  const showDates = columns.dates > 0

  return (
    <Grid container>
      <Grid size={{ xs: columns.name }}>
        <InfoTableHeaderText>{t('event.classPlacesHeader.name')}</InfoTableHeaderText>
      </Grid>
      {showDates ? (
        <Grid size={{ xs: columns.dates }}>
          <InfoTableHeaderText>{t('event.classPlacesHeader.dates')}</InfoTableHeaderText>
        </Grid>
      ) : null}
      <Grid
        size={{ xs: 2 }}
        sx={{
          textAlign: 'right',
        }}
      >
        <InfoTableHeaderText>{t('event.classPlacesHeader.entries')}</InfoTableHeaderText>
      </Grid>
      <Grid
        size={{ xs: 2 }}
        sx={{
          textAlign: 'right',
        }}
      >
        <InfoTableHeaderText>{t('event.classPlacesHeader.places')}</InfoTableHeaderText>
      </Grid>
      <Grid
        size={{ xs: 2 }}
        sx={{
          textAlign: 'right',
        }}
      >
        <InfoTableHeaderText>{t('event.classPlacesHeader.members')}</InfoTableHeaderText>
      </Grid>
    </Grid>
  )
}
