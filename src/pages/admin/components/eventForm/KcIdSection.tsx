import type { EventKcIdChoice } from '../../../../api/event'
import type { DogEvent, EventClass, Patch } from '../../../../types'
import type { BasicInfoEvent, PartialEvent, SectionProps } from './types'
import Sync from '@mui/icons-material/Sync'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { add, differenceInDays, isAfter, isSameDay } from 'date-fns'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeEventKcIdChoice, searchEventKcIdChoices } from '../../../../api/event'
import { zonedDateString, zonedEndOfDay, zonedParseDate, zonedStartOfDay } from '../../../../i18n/dates'
import {
  defaultEntryEndDate,
  defaultEntryStartDate,
  isDetaultEntryEndDate,
  isDetaultEntryStartDate,
} from '../../../../lib/event'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { idTokenAtom } from '../../../state'
import KcIdChoiceDialog from './KcIdChoiceDialog'

export interface Props extends Readonly<Omit<SectionProps, 'event'>> {
  readonly event: BasicInfoEvent
}

function KcIdSection({ disabled, event, errorStates, open, onOpenChange, onChange }: Props) {
  const { t } = useTranslation()
  const token = useAtomValue(idTokenAtom)
  const [kcIdRefreshing, setKcIdRefreshing] = useState(false)
  const [kcIdChoices, setKcIdChoices] = useState<EventKcIdChoice[]>([])
  const hasKcId = Boolean(event.kcId)
  const selectedOrganizerId = event.organizer?.id
  const canEditKcId = Boolean(selectedOrganizerId) && !disabled
  const error = (errorStates && errorStates.kcId) || false
  const helperText = error ? t('validation.event.errors') : t('event.kcIdSectionInfo')

  const handleKcIdRefresh = useCallback(async () => {
    if (!selectedOrganizerId) return

    const criteria = [event.organizer?.name, event.eventType, formatDateSpan(event.startDate, event.endDate)]
      .filter(Boolean)
      .join(', ')

    setKcIdRefreshing(true)
    setKcIdChoices([])
    try {
      const result = await searchEventKcIdChoices(
        {
          classes: event.classes.map(({ class: eventClass, date }) => ({ class: eventClass, date })),
          endDate: event.endDate,
          eventType: event.eventType ?? '',
          location: event.location ?? '',
          name: event.name ?? '',
          organizer: { id: selectedOrganizerId },
          startDate: event.startDate,
        },
        token
      )
      if (result.choices.length === 1) {
        const choice = normalizeEventKcIdChoice(result.choices[0])
        onChange?.(applyKcChoice(event, choice))
        enqueueSnackbar(t('event.kcIdSelected', { id: choice.id }), { variant: 'success' })
      } else if (result.choices.length > 1) {
        setKcIdChoices(result.choices.map(normalizeEventKcIdChoice))
      } else {
        enqueueSnackbar(t('event.kcIdNotFound', { criteria }), { variant: 'warning' })
      }
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('event.kcIdSearchFailed'), { variant: 'error' })
    } finally {
      setKcIdRefreshing(false)
    }
  }, [event, selectedOrganizerId, token, t, onChange])
  const handleKcIdChoiceClose = useCallback(() => setKcIdChoices([]), [])
  const handleKcIdChoice = useCallback(
    (choice: EventKcIdChoice) => {
      onChange?.(applyKcChoice(event, choice))
      setKcIdChoices([])
      enqueueSnackbar(t('event.kcIdSelected', { id: choice.id }), { variant: 'success' })
    },
    [event, onChange, t]
  )
  const handleKcIdRemove = useCallback(() => {
    onChange?.({ kcId: null })
    enqueueSnackbar(t('event.kcIdRemoved'), { variant: 'success' })
  }, [onChange, t])

  return (
    <>
      <CollapsibleSection
        title={t('event.kcIdSectionTitle')}
        open={open}
        onOpenChange={onOpenChange}
        error={error}
        helperText={helperText}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary" component="div">
              {t('event.kcId')}
            </Typography>
            <Typography color={hasKcId ? 'text.primary' : 'text.secondary'} fontStyle={hasKcId ? undefined : 'italic'}>
              {event.kcId ?? t('event.kcIdEmpty')}
            </Typography>
          </Box>
          {canEditKcId &&
            (hasKcId ? (
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  disabled={kcIdRefreshing}
                  size="small"
                  startIcon={<Sync fontSize="small" />}
                  onClick={handleKcIdRefresh}
                >
                  {t('event.kcIdSwitch')}
                </Button>
                <Button variant="outlined" size="small" onClick={handleKcIdRemove}>
                  {t('event.kcIdRemove')}
                </Button>
              </Stack>
            ) : (
              <Button
                variant="contained"
                disabled={kcIdRefreshing}
                size="small"
                startIcon={<Sync fontSize="small" />}
                onClick={handleKcIdRefresh}
              >
                {t('event.kcIdLookup')}
              </Button>
            ))}
          {!hasKcId && !selectedOrganizerId && !disabled && (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              {t('event.kcIdRequiresOrganizer')}
            </Typography>
          )}
        </Stack>
      </CollapsibleSection>
      <KcIdChoiceDialog choices={kcIdChoices} onClose={handleKcIdChoiceClose} onSelect={handleKcIdChoice} />
    </>
  )
}

export default memo(KcIdSection)

function formatDateSpan(start?: Date, end?: Date) {
  if (!start) return ''
  const startDate = zonedDateString(start)
  const endDate = end ? zonedDateString(end) : startDate
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`
}

function updateClassDates(event: PartialEvent, start: Date, end: Date) {
  const result: EventClass[] = []
  for (const c of event.classes) {
    const date = zonedStartOfDay(add(start, { days: differenceInDays(c.date ?? event.startDate, event.startDate) }))
    if (!isAfter(date, end)) {
      result.push({ ...c, date })
    }
  }
  return result
}

function shiftDate(date: Date, oldStartDate: Date, newStartDate: Date) {
  return zonedStartOfDay(add(newStartDate, { days: differenceInDays(date, oldStartDate) }))
}

function applyKcChoice(event: PartialEvent, choice: EventKcIdChoice): Patch<DogEvent> {
  choice = normalizeEventKcIdChoice(choice)
  const startDate = zonedStartOfDay(choice.startDate)
  const endDate = zonedEndOfDay(choice.endDate)
  let entryStartDate = choice.entryStartDate ? zonedStartOfDay(choice.entryStartDate) : event.entryStartDate
  let entryEndDate = choice.entryEndDate ? zonedEndOfDay(choice.entryEndDate) : event.entryEndDate
  if (!isSameDay(startDate, event.startDate)) {
    if (isDetaultEntryStartDate(entryStartDate, event.startDate)) {
      entryStartDate = defaultEntryStartDate(startDate)
    }
    if (isDetaultEntryEndDate(entryEndDate, event.startDate)) {
      entryEndDate = defaultEntryEndDate(startDate)
    }
  }
  const classes = updateClassDates(event, startDate, endDate)
  const dates = event.dates
    ?.map((date) => ({
      ...date,
      date: shiftDate(date.date, event.startDate, startDate),
    }))
    .filter((date) => !isAfter(date.date, endDate))
  const placesPerDayStartDate = zonedParseDate(zonedDateString(event.startDate))
  const placesPerDay = event.placesPerDay
    ? Object.fromEntries(
        Object.entries(event.placesPerDay)
          .map(
            ([date, places]) =>
              [zonedDateString(shiftDate(zonedParseDate(date), placesPerDayStartDate, startDate)), places] as const
          )
          .filter(([date]) => !isAfter(zonedStartOfDay(date), endDate))
      )
    : undefined
  const contactInfo = choice.contactInfo
    ? {
        ...event.contactInfo,
        ...(choice.contactInfo.official
          ? { official: { ...event.contactInfo?.official, ...choice.contactInfo.official } }
          : undefined),
        ...(choice.contactInfo.secretary
          ? { secretary: { ...event.contactInfo?.secretary, ...choice.contactInfo.secretary } }
          : undefined),
      }
    : undefined

  return {
    classes,
    contactInfo,
    cost: choice.cost,
    dates,
    description: choice.description,
    endDate,
    entryEndDate,
    entryStartDate,
    eventType: choice.eventType,
    kcId: choice.id,
    location: choice.location,
    placesPerDay,
    season: String(startDate.getFullYear()),
    startDate,
  }
}
