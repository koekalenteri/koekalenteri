import type { PublicDogEvent } from '../../types'

import { useTranslation } from 'react-i18next'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'

import useEventStatus from '../../hooks/useEventStatus'
import { judgeName } from '../../lib/judge'
import { printContactInfo } from '../../lib/utils'
import { API_BASE_URL } from '../../routeConfig'

import CollapsibleSection from './CollapsibleSection'
import CostInfo from './CostInfo'
import { PriorityChips } from './PriorityChips'

interface Props {
  readonly event: PublicDogEvent
  readonly invitationAttachment?: string | undefined
}

export default function RegistrationEventInfo({ event, invitationAttachment }: Props) {
  const { t } = useTranslation()
  const status = useEventStatus(event)
  const title = `${event.eventType} ${t('dateFormat.datespan', { start: event.startDate, end: event.endDate })} ${
    event.location + (event.name ? ` (${event.name})` : '')
  }`

  return (
    <Paper sx={{ p: 1, mb: 1, width: '100%' }} elevation={2}>
      <CollapsibleSection title={title} border={false}>
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
            <Grid item xs={8} sx={{ '& .info': { px: 1 } }}>
              <b>{t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}</b>&nbsp;
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
              {event.judges.map((j) => judgeName(j, t)).join(', ')}
            </Grid>
            {printContactInfo(event.contactInfo?.official) ? (
              <>
                <Grid item xs={4}>
                  {t('event.official')}:
                </Grid>
                <Grid item xs={8}>
                  {printContactInfo(event.contactInfo?.official)}
                </Grid>
              </>
            ) : null}
            {printContactInfo(event.contactInfo?.secretary) ? (
              <>
                <Grid item xs={4}>
                  {t('event.secretary')}:
                </Grid>
                <Grid item xs={8}>
                  {printContactInfo(event.contactInfo?.secretary)}
                </Grid>
              </>
            ) : null}
          </Grid>
          <Grid item container sm={12} md columnSpacing={1}>
            <Grid item xs={4}>
              {t('event.cost')}:
            </Grid>
            <Grid item xs={8}>
              <CostInfo event={event} />
            </Grid>
            {event.priority ? (
              <>
                <Grid item xs={4}>
                  {t('event.priority')}:
                </Grid>
                <Grid item xs={8}>
                  <PriorityChips priority={event.priority} />
                </Grid>
              </>
            ) : null}
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
            {invitationAttachment && event.state === 'invited' ? (
              <>
                <Grid item xs={4}>
                  {t('event.attachments')}:
                </Grid>
                <Grid item xs={8}>
                  <PictureAsPdfOutlined fontSize="small" sx={{ verticalAlign: 'middle', pr: 0.5 }} />
                  <Link
                    href={`${API_BASE_URL}/file/${invitationAttachment}/kutsu.pdf`}
                    rel="noopener"
                    target="_blank"
                    type="application/pdf"
                    variant="caption"
                  >
                    Kutsu.pdf
                  </Link>
                </Grid>
              </>
            ) : null}
          </Grid>
        </Grid>
      </CollapsibleSection>
    </Paper>
  )
}
