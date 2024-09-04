import type { ReactNode } from 'react'
import type { ConfirmedEvent, PublicDogEvent } from '../../types'

import { useTranslation } from 'react-i18next'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Grid2 from '@mui/material/Grid2'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

import { judgeName } from '../../lib/judge'
import { printContactInfo } from '../../lib/utils'
import { Path } from '../../routeConfig'

import CollapsibleSection from './CollapsibleSection'
import CostInfo from './CostInfo'
import { EntryStatus } from './EntryStatus'
import { PriorityChips } from './PriorityChips'

interface Props {
  readonly event: PublicDogEvent
  readonly invitationAttachment?: string | undefined
}

const Header = ({ children }: { children: ReactNode }) => (
  <Grid2 size={{ xs: 4 }} alignContent="top" sx={{ borderRight: '1px dashed #eee', borderBottom: '1px solid #eee' }}>
    <Typography variant="caption">{children}</Typography>
  </Grid2>
)

const Data = ({ children }: { children: ReactNode }) => (
  <Grid2 size={{ xs: 7 }} alignContent="center" sx={{ borderBottom: '1px solid #eee' }}>
    <Typography variant="body2" component="div">
      {children}
    </Typography>
  </Grid2>
)

export default function RegistrationEventInfo({ event, invitationAttachment }: Props) {
  const { t } = useTranslation()
  const title = `${event.eventType} ${t('dateFormat.datespan', { start: event.startDate, end: event.endDate })} ${
    event.location + (event.name ? ` (${event.name})` : '')
  }`

  return (
    <Paper sx={{ p: { xs: 0, sm: 1 }, mb: 1, width: '100%' }} elevation={2}>
      <CollapsibleSection title={title} border={false}>
        <Grid2
          container
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ '& .MuiGrid2-root': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
        >
          <Grid2 container size={{ sm: 12, md: 6, lg: 4 }} columnSpacing={1}>
            <Header>{t('entryTime')}</Header>
            <Data>
              <b>{t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}</b>&nbsp;
              <EntryStatus event={event} />
            </Data>
            <Header>{t('event.organizer')}</Header>
            <Data>{event.organizer?.name}</Data>
            <Header>{t('event.judges')}</Header>
            <Data>{event.judges.map((j) => judgeName(j, t)).join(', ')}</Data>
            {printContactInfo(event.contactInfo?.official) ? (
              <>
                <Header>{t('event.official')}</Header>
                <Data>{printContactInfo(event.contactInfo?.official)}</Data>
              </>
            ) : null}
            {printContactInfo(event.contactInfo?.secretary) ? (
              <>
                <Header>{t('event.secretary')}</Header>
                <Data>{printContactInfo(event.contactInfo?.secretary)}</Data>
              </>
            ) : null}
          </Grid2>
          <Grid2 container size={{ sm: 12, md: 6, lg: 4 }} columnSpacing={1}>
            <Header>{t('event.cost')}</Header>
            <Data>
              <CostInfo event={event} />
            </Data>
            {event.priority ? (
              <>
                <Header>{t('event.priority')}</Header>
                <Data>
                  <PriorityChips priority={event.priority} />
                </Data>
              </>
            ) : null}
            {event.description ? (
              <>
                <Header>{t('event.description')}</Header>
                <Data>{event.description}</Data>
              </>
            ) : null}
            {invitationAttachment && event.state === 'invited' ? (
              <>
                <Header>{t('event.attachments')}</Header>
                <Data>
                  <PictureAsPdfOutlined fontSize="small" sx={{ verticalAlign: 'middle', pr: 0.5 }} />
                  <Link
                    href={Path.invitationAttachment({ ...event, invitationAttachment } as ConfirmedEvent)}
                    rel="noopener"
                    target="_blank"
                    type="application/pdf"
                    variant="caption"
                  >
                    Kutsu.pdf
                  </Link>
                </Data>
              </>
            ) : null}
          </Grid2>
        </Grid2>
      </CollapsibleSection>
    </Paper>
  )
}
