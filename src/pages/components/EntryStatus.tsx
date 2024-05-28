import type { MinimalEventForStatus } from '../../hooks/useEventStatus'

import Typography from '@mui/material/Typography'

import useEventStatus from '../../hooks/useEventStatus'

interface Props {
  readonly event: MinimalEventForStatus
}

export const EntryStatus = ({ event }: Props) => {
  const status = useEventStatus(event)

  if (!status) return null

  return (
    <Typography variant="body2" display="inline" mx={0.5}>
      {status}
    </Typography>
  )
}
