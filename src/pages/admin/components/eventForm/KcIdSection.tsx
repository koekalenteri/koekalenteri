import type { TFunction } from 'i18next'
import type { BasicInfoEvent, SectionProps } from './types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../../i18n/dates'
import { localeSortComparator } from '../../../../lib/datagrid'
import { unique } from '../../../../lib/utils'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { useIsOfficialEventType } from '../../hooks/useIsOfficialEventType'
import { KcIdLookupButton } from '../KcIdLookupButton'

export interface Props extends Readonly<Omit<SectionProps, 'event'>> {
  readonly event: BasicInfoEvent
}

function KcIdSection({ disabled, event, errorStates, open, onOpenChange, onChange }: Props) {
  const { t } = useTranslation()
  const official = useIsOfficialEventType(event.eventType)
  const organizerId = event.organizer?.id
  const hasKcId = Boolean(event.kcId)
  const canEditKcId = Boolean(organizerId) && !disabled
  const error = (errorStates && errorStates.kcId) || false
  const helperText = error ? t('validation.event.errors') : t('event.kcIdSectionInfo')
  const warnings = useMemo(() => computeKcWarnings(event, t), [event, t])

  // Only the Kennel Club's own event types have a koetunnus, so for the rest there is no section.
  if (!official) return null

  return (
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
        {canEditKcId && <KcIdLookupButton editable event={event} onChange={onChange} />}
        {!hasKcId && !organizerId && !disabled && (
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
