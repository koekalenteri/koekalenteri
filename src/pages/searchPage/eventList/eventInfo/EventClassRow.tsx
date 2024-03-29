import type { PublicDogEvent } from '../../../../types'

import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

import { EventClassTable } from './EventClassTable'

interface Props {
  readonly event: PublicDogEvent
}
export const EventClassRow = ({ event }: Props) => {
  const { t } = useTranslation()

  return (
    <TableRow key={event.id + 'classes'}>
      <TableCell component="th" scope="row">
        {t('event.classes')}:
      </TableCell>
      <TableCell>
        <EventClassTable event={event} />
      </TableCell>
    </TableRow>
  )
}
