import type { ReactNode } from 'react'
import type { StartListAvailabilityEvent } from '@/lib/event'
import type { PublicDogEvent } from '@/types'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasAllResultsPublished, isStartListAvailable } from '@/lib/event'
import { Path } from '@/routeConfig'
import LinkButton from '../../components/LinkButton'

interface Props {
  /** What the two gates read, the dates included: a state never advanced opens by them (KOE-1504). */
  readonly event: Pick<PublicDogEvent, 'id'> & StartListAvailabilityEvent & Parameters<typeof hasAllResultsPublished>[0]
  /** Whether a post is being run right now (KOE-1259), so the list can say the start list is live. */
  readonly live?: boolean
  readonly text?: string | ReactNode | null
}

export function EventStateInfo({ event, live = false, text = null }: Props) {
  const { t } = useTranslation()
  const [startListLoading, setStartListLoading] = useState(false)

  const { id, state } = event

  if (isStartListAvailable(event)) {
    // While any class is still running the list is the participants; only a complete set of
    // published results turns the same page into the results (KOE-1285).
    const complete = hasAllResultsPublished(event)
    const link = (
      <LinkButton
        aria-label={startListLoading ? t('loading') : undefined}
        loading={startListLoading}
        onClick={() => setStartListLoading(true)}
        to={Path.startList(id)}
        text={t(complete ? 'viewResults' : 'viewStartList')}
      />
    )
    if (!live) return link

    // The day is on: the same page now shows who is at the post, which is worth a word in the list.
    return (
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: 'center',
        }}
      >
        <Chip color="error" label={t('liveStatus.title')} size="small" sx={{ fontWeight: 600, height: 20 }} />
        {link}
      </Stack>
    )
  }

  return (
    <Box sx={{ textTransform: 'uppercase' }} component="span">
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : text}
    </Box>
  )
}
