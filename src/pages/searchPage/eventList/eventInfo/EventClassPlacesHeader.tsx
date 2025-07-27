import type { PublicDogEvent } from '../../../../types'

import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'

import InfoTableHeaderText from '../../../components/InfoTableHeaderText'

export const EventClassPlacesHeader = ({ event }: { event: PublicDogEvent }) => {
  const { t } = useTranslation()

  const showDates = event.classes.length > 0

  return (
    <Grid2 container>
      <Grid2 size={{ xs: showDates ? 2 : 6 }}>
        <InfoTableHeaderText>{t('event.classPlacesHeader.name')}</InfoTableHeaderText>
      </Grid2>
      {showDates ? (
        <Grid2 size={{ xs: 4 }}>
          <InfoTableHeaderText>{t('event.classPlacesHeader.dates')}</InfoTableHeaderText>
        </Grid2>
      ) : null}
      <Grid2 size={{ xs: 2 }} textAlign="right">
        <InfoTableHeaderText>{t('event.classPlacesHeader.entries')}</InfoTableHeaderText>
      </Grid2>
      <Grid2 size={{ xs: 2 }} textAlign="right">
        <InfoTableHeaderText>{t('event.classPlacesHeader.places')}</InfoTableHeaderText>
      </Grid2>
      <Grid2 size={{ xs: 2 }} textAlign="right">
        <InfoTableHeaderText>{t('event.classPlacesHeader.members')}</InfoTableHeaderText>
      </Grid2>
    </Grid2>
  )
}
