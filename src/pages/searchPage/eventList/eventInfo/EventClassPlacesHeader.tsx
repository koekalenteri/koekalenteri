import type { PublicDogEvent } from '../../../../types'
import Grid from '@mui/material/Grid'
import { useTranslation } from 'react-i18next'
import InfoTableHeaderText from '../../../components/InfoTableHeaderText'

export const EventClassPlacesHeader = ({ event }: { event: PublicDogEvent }) => {
  const { t } = useTranslation()

  const showDates = event.classes.length > 0

  return (
    <Grid container>
      <Grid size={{ xs: showDates ? 2 : 6 }}>
        <InfoTableHeaderText>{t('event.classPlacesHeader.name')}</InfoTableHeaderText>
      </Grid>
      {showDates ? (
        <Grid size={{ xs: 4 }}>
          <InfoTableHeaderText>{t('event.classPlacesHeader.dates')}</InfoTableHeaderText>
        </Grid>
      ) : null}
      <Grid size={{ xs: 2 }} textAlign="right">
        <InfoTableHeaderText>{t('event.classPlacesHeader.entries')}</InfoTableHeaderText>
      </Grid>
      <Grid size={{ xs: 2 }} textAlign="right">
        <InfoTableHeaderText>{t('event.classPlacesHeader.places')}</InfoTableHeaderText>
      </Grid>
      <Grid size={{ xs: 2 }} textAlign="right">
        <InfoTableHeaderText>{t('event.classPlacesHeader.members')}</InfoTableHeaderText>
      </Grid>
    </Grid>
  )
}
