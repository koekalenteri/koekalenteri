import type { FormatOwner } from '@/lib/event'
import type { EventStation } from '@/types'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { formatTypeOf } from '@/lib/event'
import { liveFormat } from '@/lib/liveFormat'

interface Props {
  readonly station: Pick<EventStation, 'number'>
  /** The trial, whose format (`formatTypeOf`) says whether the day runs at one post. */
  readonly event: FormatOwner
  /** The line under the post number: the trial, as the link's holder needs it named. */
  readonly subtitle: string
}

/** The head of the post's sheet behind a live entry link, which has no way back to go with it. */
export function StationHeading({ station, event, subtitle }: Props) {
  const { t } = useTranslation()
  // Where the day runs at one post, "Suorituspaikka 1" names nothing anyone calls it; the event is the title.
  const singlePost = liveFormat(formatTypeOf(event)).posts === 'one'

  return (
    <Box sx={{ pt: 2, px: 2 }}>
      {!singlePost && (
        <Typography variant="h3" component="h1">
          {t('event.station')} {station.number}
        </Typography>
      )}
      <Typography
        color={singlePost ? undefined : 'text.secondary'}
        component={singlePost ? 'h1' : 'p'}
        variant={singlePost ? 'h3' : 'body2'}
      >
        {subtitle}
      </Typography>
    </Box>
  )
}
