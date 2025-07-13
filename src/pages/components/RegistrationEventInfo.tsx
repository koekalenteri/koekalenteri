import type { ConfirmedEvent, PublicDogEvent } from '../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Grid2 from '@mui/material/Grid2'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'

import { judgeName } from '../../lib/judge'
import { printContactInfo } from '../../lib/utils'
import { Path } from '../../routeConfig'

import { CollapsibleEvent } from './CollapsibleEvent'
import CostInfo from './CostInfo'
import { EntryStatus } from './EntryStatus'
import { ItemWithCaption } from './ItemWithCaption'
import { PriorityChips } from './PriorityChips'

interface Props {
  readonly event: PublicDogEvent
  readonly invitationAttachment?: string | undefined
}

const Header = ({ event }: Props) => {
  const { t } = useTranslation()

  const title = `${event.eventType} ${t('dateFormat.datespan', { start: event.startDate, end: event.endDate })} ${
    event.location + (event.name ? ` (${event.name})` : '')
  }`

  return (
    <>
      <Grid2 container columnSpacing={1} size={12}>
        <Grid2 overflow={'hidden'} textOverflow={'ellipsis'} sx={{ textWrap: 'nowrap' }} size="grow">
          <Typography variant="caption" color="text.secondary">
            {event.organizer.name}
          </Typography>
        </Grid2>
      </Grid2>
      <Grid2
        container
        columnSpacing={1}
        size={{
          xs: 12,
          sm: 'auto',
        }}
      >
        {title}
      </Grid2>
    </>
  )
}

export default function RegistrationEventInfo({ event, invitationAttachment }: Props) {
  const { t } = useTranslation()
  const judges = useMemo(() => event.judges.map((j) => judgeName(j, t)).join(', '), [event.judges])

  return (
    <CollapsibleEvent eventId={event.id} header={<Header event={event} />}>
      <Grid2 container justifyContent="space-between" alignItems="flex-start" columnSpacing={1}>
        <ItemWithCaption label={t('entryTime')}>
          {t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}
          <EntryStatus event={event} />
        </ItemWithCaption>
        <ItemWithCaption label={t('event.organizer')}>{event.organizer?.name}</ItemWithCaption>
        <ItemWithCaption label={t('event.judges')}>{judges}</ItemWithCaption>
        {printContactInfo(event.contactInfo?.official) ? (
          <ItemWithCaption label={t('event.official')}>{printContactInfo(event.contactInfo?.official)}</ItemWithCaption>
        ) : null}
        {printContactInfo(event.contactInfo?.secretary) ? (
          <ItemWithCaption label={t('event.secretary')}>
            {printContactInfo(event.contactInfo?.secretary)}
          </ItemWithCaption>
        ) : null}
        <ItemWithCaption label={t('paymentDetails')}>
          <CostInfo event={event} />
        </ItemWithCaption>
        {event.priority ? (
          <ItemWithCaption label={t('event.priority')}>
            <PriorityChips priority={event.priority} />
          </ItemWithCaption>
        ) : null}
        {event.description ? (
          <ItemWithCaption label={t('event.description')}>{event.description}</ItemWithCaption>
        ) : null}
        {invitationAttachment && event.state === 'invited' ? (
          <ItemWithCaption label={t('event.attachments')}>
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
          </ItemWithCaption>
        ) : null}
      </Grid2>
    </CollapsibleEvent>
  )
}
