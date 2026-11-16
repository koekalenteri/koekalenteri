import type { ClassKey, DayKey, DeepPartial, EventClass } from '@/types'
import type { EntryEvent } from '../../types'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'
import { getEventClassesByDays, getUniqueEventClasses } from '@/lib/event'
import { NumberInput } from '@/pages/components/NumberInput'
import { calculateTotalFromClasses, isClassDateActive } from '../../places'
import BasePlacesTable from './BasePlacesTable'
import PlacesDisplay from './PlacesDisplay'

interface ClassPlacesTableProps {
  readonly event: EntryEvent
  readonly disabled: boolean
  readonly handleChange: (cls: DeepPartial<EventClass>, value?: number) => void
}

interface DayClassCellsProps extends Pick<ClassPlacesTableProps, 'disabled' | 'handleChange'> {
  readonly classes: DeepPartial<EventClass>[]
  readonly day: DayKey
  readonly uniqueClasses: ClassKey[]
}

/** A day's places, one input per class the day runs; a day without a class says so (KOE-1756). */
function DayClassCells({ classes, day, disabled, handleChange, uniqueClasses }: Readonly<DayClassCellsProps>) {
  const { t } = useTranslation()

  if (uniqueClasses.length > 0 && !classes.some(isClassDateActive)) {
    // No one can enter for a day without a class, so it takes no places either.
    return (
      <TableCell colSpan={uniqueClasses.length} sx={{ color: 'text.secondary' }}>
        {t('event.placesEditor.noClasses')}
      </TableCell>
    )
  }

  return uniqueClasses.map((c) => {
    const cls = classes.find((cl) => cl.class === c)
    return (
      <TableCell key={c} align="center">
        {cls && isClassDateActive(cls) ? (
          <NumberInput
            slotProps={{
              input: { inputProps: { 'aria-label': `${t('dateFormat.wdshort', { date: day })} ${c}` } },
            }}
            disabled={disabled}
            value={cls.places || undefined}
            onChange={(value) => handleChange(cls, value)}
          />
        ) : (
          ''
        )}
      </TableCell>
    )
  })
}

export default function ClassPlacesTable({ event, disabled, handleChange }: Readonly<ClassPlacesTableProps>) {
  const { t } = useTranslation()
  const uniqueClasses = getUniqueEventClasses(event)
  const classesByDays = getEventClassesByDays(event)

  // Create headers array with date and class columns
  const headers = [t('date'), ...uniqueClasses.map((c) => c), t('event.placesEditor.total')]

  return (
    <BasePlacesTable headers={headers}>
      {classesByDays.map(({ day, classes }) => {
        const dayTotal = calculateTotalFromClasses(classes)
        return (
          <TableRow key={day}>
            <TableCell component="th" scope="row">
              {t('dateFormat.wdshort', { date: day })}
            </TableCell>
            <DayClassCells
              classes={classes}
              day={day}
              disabled={disabled}
              handleChange={handleChange}
              uniqueClasses={uniqueClasses}
            />
            <TableCell align="center">
              <PlacesDisplay value={dayTotal} />
            </TableCell>
          </TableRow>
        )
      })}
      <TableRow>
        <TableCell component="th" scope="row">
          {t('event.placesEditor.total')}
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
