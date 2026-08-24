import type { DeepPartial, EventClass } from '../../../../../../types'
import type { EntryEvent } from '../../types'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'
import { getEventClassesByDays, getUniqueEventClasses } from '../../../../../../lib/event'
import { NumberInput } from '../../../../../components/NumberInput'
import { calculateTotalFromClasses, isClassDateActive } from '../../places'
import BasePlacesTable from './BasePlacesTable'
import PlacesDisplay from './PlacesDisplay'

interface ClassPlacesTableProps {
  event: EntryEvent
  disabled: boolean
  handleChange: (cls: DeepPartial<EventClass>, value?: number) => void
}

export default function ClassPlacesTable({ event, disabled, handleChange }: Readonly<ClassPlacesTableProps>) {
  const { t } = useTranslation()
  const uniqueClasses = getUniqueEventClasses(event)
  const classesByDays = getEventClassesByDays(event)

  // Create headers array with date and class columns
  const headers = [t('date'), ...uniqueClasses.map((c) => c), 'Yhteensä']

  return (
    <BasePlacesTable headers={headers}>
      {classesByDays.map(({ day, classes }) => {
        const dayTotal = calculateTotalFromClasses(classes)
        return (
          <TableRow key={day.toISOString()}>
            <TableCell component="th" scope="row">
              {t('dateFormat.wdshort', { date: day })}
            </TableCell>
            {uniqueClasses.map((c) => {
              const cls = classes.find((cl) => cl.class === c)
              const active = cls && isClassDateActive(cls)
              return (
                <TableCell key={c} align="center">
                  {active ? (
                    <NumberInput
                      disabled={disabled}
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
          <PlacesDisplay value={calculateTotalFromClasses(event.classes)} />
        </TableCell>
      </TableRow>
    </BasePlacesTable>
  )
}
