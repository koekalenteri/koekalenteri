import { useTranslation } from 'react-i18next'
import { Grid, Paper, Typography } from '@mui/material'
import { ConfirmedEvent } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import useEventStatus from '../../hooks/useEventStatus'
import { entryDateColor } from '../../utils'
import { judgesByIdsSelector } from '../recoil'

import CollapsibleSection from './CollapsibleSection'
import CostInfo from './CostInfo'

export default function RegistrationEventInfo({ event }: { event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const status = useEventStatus(event)
  const judges = useRecoilValue(judgesByIdsSelector(event.judges))

  return (
    <Paper sx={{ p: 1, mb: 1, width: '100%' }} elevation={2}>
      <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
        {event.eventType} {t('daterange', { start: event.startDate, end: event.endDate })}{' '}
        {event.location + (event.name ? ` (${event.name})` : '')}
      </Typography>
      <CollapsibleSection title={t('eventInfo')}>
        <Grid
          container
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ '& .MuiGrid-item': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
        >
          <Grid item container sm={12} md columnSpacing={1}>
            <Grid item xs={4}>
              {t('entryTime')}:
            </Grid>
            <Grid item xs={8} sx={{ color: entryDateColor(event), '& .info': { color: 'info.dark', px: 1 } }}>
              <b>{t('daterange', { start: event.entryStartDate, end: event.entryEndDate })}</b>&nbsp;
              <span className="info">{status}</span>
            </Grid>
            <Grid item xs={4}>
              {t('event.organizer')}:
            </Grid>
            <Grid item xs={8}>
              {event.organizer?.name}
            </Grid>
            <Grid item xs={4}>
              {t('event.judges')}:
            </Grid>
            <Grid item xs={8}>
              {judges.map((j) => j.name).join(', ')}
            </Grid>
            <Grid item xs={4}>
              {t('event.official')}:
            </Grid>
            <Grid item xs={8}>
              {event.official?.name || ''}
            </Grid>
          </Grid>
          <Grid item container sm={12} md columnSpacing={1}>
            <Grid item xs={4}>
              {t('event.paymentDetails')}:
            </Grid>
            <Grid item xs={8}>
              <CostInfo event={event} />
            </Grid>
            {event.description ? (
              <>
                <Grid item xs={4}>
                  {t('event.description')}:
                </Grid>
                <Grid item xs={8}>
                  {event.description}
                </Grid>
              </>
            ) : null}
          </Grid>
        </Grid>
      </CollapsibleSection>
    </Paper>
  )
}
