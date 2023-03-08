import { useTranslation } from 'react-i18next'
import { TableCell, TableRow } from '@mui/material'
import { Event } from 'koekalenteri-shared/model'

import { EventClassTable } from './EventClassTable'

interface Props {
  event: Event
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
