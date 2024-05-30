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
    <Typography display="inline" ml={1}>
      {status}
    </Typography>
  )
}
