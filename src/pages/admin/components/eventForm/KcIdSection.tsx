import type { TFunction } from 'i18next'
import type { EventKcIdChoice } from '../../../../api/event'
import type { DogEvent, Patch } from '../../../../types'
import type { BasicInfoEvent, SectionProps } from './types'
import Sync from '@mui/icons-material/Sync'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeEventKcIdChoice, searchEventKcIdChoices } from '../../../../api/event'
import { zonedDateString, zonedEndOfDay, zonedStartOfDay } from '../../../../i18n/dates'
import { localeSortComparator } from '../../../../lib/datagrid'
import { unique } from '../../../../lib/utils'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { idTokenAtom } from '../../../state'
import KcIdChoiceDialog from './KcIdChoiceDialog'

export interface Props extends Readonly<Omit<SectionProps, 'event'>> {
  readonly event: BasicInfoEvent
  /** koetunnukset already linked to some other event in Koekalenteri */
  readonly linkedKcIds?: ReadonlySet<number>
}

function KcIdSection({ disabled, event, errorStates, linkedKcIds, open, onOpenChange, onChange }: Props) {
  const { t } = useTranslation()
  const token = useAtomValue(idTokenAtom)
  const [kcIdRefreshing, setKcIdRefreshing] = useState(false)
  const [kcIdChoices, setKcIdChoices] = useState<EventKcIdChoice[]>([])
  const hasKcId = Boolean(event.kcId)
  const selectedOrganizerId = event.organizer?.id
  const canEditKcId = Boolean(selectedOrganizerId) && !disabled
  const error = (errorStates && errorStates.kcId) || false
  const helperText = error ? t('validation.event.errors') : t('event.kcIdSectionInfo')
  const warnings = useMemo(() => computeKcWarnings(event, t), [event, t])

  // The koetunnus may already belong to another event; say so at pick time instead of leaving it to
  // the conflict the backend raises on save.
  const selectChoice = useCallback(
    (choice: EventKcIdChoice) => {
      if (linkedKcIds?.has(choice.id)) {
        enqueueSnackbar(t('event.kcIdConflict'), { variant: 'error' })
        return false
      }
      onChange?.(applyKcChoice(choice))
      enqueueSnackbar(t('event.kcIdSelected', { id: choice.id }), { variant: 'success' })
      return true
    },
    [linkedKcIds, onChange, t]
  )

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
        selectChoice(normalizeEventKcIdChoice(result.choices[0]))
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
  }, [event, selectedOrganizerId, token, t, selectChoice])
  const handleKcIdChoiceClose = useCallback(() => setKcIdChoices([]), [])
  const handleKcIdChoice = useCallback(
    (choice: EventKcIdChoice) => {
      if (selectChoice(choice)) setKcIdChoices([])
    },
    [selectChoice]
  )
  const handleKcIdRemove = useCallback(() => {
    onChange?.({ kcEvent: null, kcId: null })
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
        {warnings.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </Alert>
        )}
      </CollapsibleSection>
      <KcIdChoiceDialog
        choices={kcIdChoices}
        linkedKcIds={linkedKcIds}
        onClose={handleKcIdChoiceClose}
        onSelect={handleKcIdChoice}
      />
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

function joinSorted(values: readonly (string | undefined)[] | undefined) {
  return unique((values ?? []).filter((v): v is string => Boolean(v)))
    .sort(localeSortComparator)
    .join(', ')
}

function computeKcWarnings(event: BasicInfoEvent, t: TFunction) {
  const kcEvent = event.kcEvent
  if (!event.kcId || !kcEvent) return []

  const warnings: string[] = []

  if (kcEvent.eventType && event.eventType !== kcEvent.eventType) {
    warnings.push(t('event.kcIdWarningType', { eventType: event.eventType, kcEventType: kcEvent.eventType }))
  }

  const classes = joinSorted(event.classes?.map((c) => c?.class))
  const kcClasses = joinSorted(kcEvent.classes)
  if (kcClasses && classes !== kcClasses) {
    warnings.push(t('event.kcIdWarningClasses', { classes, kcClasses }))
  }

  const dates = formatDateSpan(event.startDate, event.endDate)
  const kcDates = formatDateSpan(kcEvent.startDate, kcEvent.endDate)
  if (kcDates && dates !== kcDates) {
    warnings.push(t('event.kcIdWarningDates', { dates, kcDates }))
  }

  if (kcEvent.location && event.location !== kcEvent.location) {
    warnings.push(t('event.kcIdWarningLocation', { kcLocation: kcEvent.location, location: event.location }))
  }

  if (kcEvent.judge) {
    const judgeNames = new Set((event.judges ?? []).map((j) => j?.name?.trim().toLocaleLowerCase('fi')).filter(Boolean))
    if (!judgeNames.has(kcEvent.judge.trim().toLocaleLowerCase('fi'))) {
      warnings.push(t('event.kcIdWarningJudge', { kcJudge: kcEvent.judge }))
    }
  }

  return warnings
}

function applyKcChoice(choice: EventKcIdChoice): Patch<DogEvent> {
  const normalized = normalizeEventKcIdChoice(choice)

  return {
    kcEvent: {
      classes: normalized.classes,
      endDate: zonedEndOfDay(normalized.endDate),
      eventType: normalized.eventType,
      judge: normalized.judge,
      location: normalized.location,
      startDate: zonedStartOfDay(normalized.startDate),
    },
    kcId: normalized.id,
  }
}
