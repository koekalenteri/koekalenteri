import type { PartialEvent } from '../../types'

import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

import { formatDate } from '../../../../../../i18n/dates'
import { getEventDays } from '../../../../../../lib/event'
import { NumberInput } from '../../../../../components/NumberInput'

import BasePlacesTable from './BasePlacesTable'

interface DayPlacesTableProps {
  event: PartialEvent
  disabled: boolean
  handleDayPlacesChange: (date: Date, value?: number) => void
  handlePlacesChange: (value?: number) => void
  totalEnabled: boolean
}

export default function DayPlacesTable({
  event,
  disabled,
  handleDayPlacesChange,
  handlePlacesChange,
  totalEnabled,
}: DayPlacesTableProps) {
  const { t } = useTranslation()
  const eventDays = getEventDays(event)

  const headers = [t('date'), 'Paikat']

  return (
    <BasePlacesTable headers={headers}>
      {eventDays.map((day) => {
        const dateStr = formatDate(day, 'yyyy-MM-dd')
        const places = event.placesPerDay?.[dateStr] || 0

        return (
          <TableRow key={dateStr}>
            <TableCell component="th" scope="row">
              {t('dateFormat.wdshort', { date: day })}
            </TableCell>
            <TableCell align="center">
              <NumberInput
                disabled={disabled || totalEnabled}
                value={places}
                onChange={(value) => handleDayPlacesChange(day, value)}
              />
            </TableCell>
          </TableRow>
        )
      })}
      <TableRow>
        <TableCell component="th" scope="row">
          Yhteensä
        </TableCell>
        <TableCell align="center">
          <NumberInput
            id="event.places"
            disabled={disabled || !totalEnabled}
            value={event.places}
            onChange={handlePlacesChange}
          />
        </TableCell>
      </TableRow>
    </BasePlacesTable>
  )
}
