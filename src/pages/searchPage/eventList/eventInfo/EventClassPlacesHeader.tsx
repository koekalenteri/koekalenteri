import type { TypographyProps } from '@mui/material/Typography'
import type { PublicDogEvent } from '../../../../types'

import { useTranslation } from 'react-i18next'
import { styled } from '@mui/material'
import Grid2 from '@mui/material/Grid2'
import Typography from '@mui/material/Typography'

const Caption = (props: TypographyProps) => <Typography {...props} variant="caption" />

const HeaderText = styled(Caption)(({ theme }) => ({
  paddingLeft: 4,
  paddingRight: 4,
  paddingTop: 0,
  paddingBottom: 0,
  width: '100%',
  display: 'block',
  backgroundColor: theme.palette.background.tableHead,
}))

export const EventClassPlacesHeader = ({ event }: { event: PublicDogEvent }) => {
  const { t } = useTranslation()

  const showDates = event.classes.length > 0

  return (
    <Grid2 container>
      <Grid2 size={{ xs: showDates ? 2 : 6 }}>
        <HeaderText>{t('event.classPlacesHeader.name')}</HeaderText>
      </Grid2>
      {showDates ? (
        <Grid2 size={{ xs: 4 }}>
          <HeaderText>{t('event.classPlacesHeader.dates')}</HeaderText>
        </Grid2>
      ) : null}
      <Grid2 size={{ xs: 2 }} textAlign="right">
        <HeaderText>{t('event.classPlacesHeader.entries')}</HeaderText>
      </Grid2>
      <Grid2 size={{ xs: 2 }} textAlign="right">
        <HeaderText>{t('event.classPlacesHeader.places')}</HeaderText>
      </Grid2>
      <Grid2 size={{ xs: 2 }} textAlign="right">
        <HeaderText>{t('event.classPlacesHeader.members')}</HeaderText>
      </Grid2>
    </Grid2>
  )
}
