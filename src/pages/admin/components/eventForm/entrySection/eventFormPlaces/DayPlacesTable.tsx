import type { EntryEvent } from '../../types'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../../../../i18n/dates'
import { getEventDays } from '../../../../../../lib/event'
import { NumberInput } from '../../../../../components/NumberInput'
import { calculateTotalFromDays } from '../../places'
import BasePlacesTable from './BasePlacesTable'
import PlacesDisplay from './PlacesDisplay'

interface DayPlacesTableProps {
  event: EntryEvent
  disabled: boolean
  handleDayPlacesChange: (date: Date, value?: number) => void
}

export default function DayPlacesTable({ event, disabled, handleDayPlacesChange }: Readonly<DayPlacesTableProps>) {
  const { t } = useTranslation()
  const eventDays = getEventDays(event)

  const headers = [t('date'), 'Paikat']

  return (
    <BasePlacesTable headers={headers}>
      {eventDays.map((day) => {
        const dateStr = formatDate(day, 'yyyy-MM-dd')
        const places = event.placesPerDay?.[dateStr] ?? 0

        return (
          <TableRow key={dateStr}>
            <TableCell component="th" scope="row">
              {t('dateFormat.wdshort', { date: day })}
            </TableCell>
            <TableCell align="center">
              <NumberInput disabled={disabled} value={places} onChange={(value) => handleDayPlacesChange(day, value)} />
            </TableCell>
          </TableRow>
        )
      })}
      <TableRow>
        <TableCell component="th" scope="row">
          Yhteensä
        </TableCell>
        <TableCell align="center">
          <PlacesDisplay value={calculateTotalFromDays(event.placesPerDay)} />
        </TableCell>
      </TableRow>
    </BasePlacesTable>
  )
}
