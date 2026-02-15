import type { DeepPartial, EventClass } from '../../../../../../types'
import type { PartialEvent } from '../../types'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'
import { getEventClassesByDays, getUniqueEventClasses } from '../../../../../../lib/event'
import { calculateTotalFromClasses } from '../../../../../../lib/places'
import { NumberInput } from '../../../../../components/NumberInput'
import BasePlacesTable from './BasePlacesTable'
import PlacesDisplay from './PlacesDisplay'

interface ClassPlacesTableProps {
  event: PartialEvent
  disabled: boolean
  classesEnabled: boolean
  handleChange: (cls: DeepPartial<EventClass>, value?: number) => void
  handlePlacesChange: (value?: number) => void
}

export default function ClassPlacesTable({
  event,
  disabled,
  classesEnabled,
  handleChange,
  handlePlacesChange,
}: Readonly<ClassPlacesTableProps>) {
  const { t } = useTranslation()
  const uniqueClasses = getUniqueEventClasses(event)
  const classesByDays = getEventClassesByDays(event)

  // Create headers array with date and class columns
  const headers = [t('date'), ...uniqueClasses.map((c) => c), 'Yhteensä']

  return (
    <BasePlacesTable headers={headers}>
      {classesByDays.map(({ day, classes }) => {
        let dayTotal = 0
        return (
          <TableRow key={day.toISOString()}>
            <TableCell component="th" scope="row">
              {t('dateFormat.wdshort', { date: day })}
            </TableCell>
            {uniqueClasses.map((c) => {
              const cls = classes.find((cl) => cl.class === c)
              dayTotal += cls?.places ?? 0
              return (
                <TableCell key={c} align="center">
                  {cls ? (
                    <NumberInput
                      disabled={disabled || !classesEnabled}
                      value={cls.places || undefined}
                      onChange={(value) => handleChange(cls, value)}
                    />
                  ) : (
                    ''
                  )}
                </TableCell>
              )
            })}
            <TableCell align="center">
              <PlacesDisplay value={dayTotal} />
            </TableCell>
          </TableRow>
        )
      })}
      <TableRow>
        <TableCell component="th" scope="row">
          Yhteensä
        </TableCell>
        {uniqueClasses.map((c) => {
          const classTotal = calculateTotalFromClasses(event.classes.filter((ec) => ec.class === c))
          return (
            <TableCell key={c} align="center">
              <PlacesDisplay value={classTotal} />
            </TableCell>
          )
        })}
        <TableCell align="center">
          <NumberInput
            id="event.places"
            disabled={disabled || classesEnabled}
            value={event.places}
            onChange={handlePlacesChange}
          />
        </TableCell>
      </TableRow>
    </BasePlacesTable>
  )
}
