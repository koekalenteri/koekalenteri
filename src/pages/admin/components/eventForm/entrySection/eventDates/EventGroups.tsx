import type { AutocompleteChangeReason } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { RegistrationDate } from '../../../../../../types'
import type { SectionProps } from '../../types'

import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Stack from '@mui/material/Stack'
import { useRecoilValue } from 'recoil'

import { useAdminEventDatesOptions } from '../../../../../../hooks/useAdminEventDatesOptions'
import { useAdminEventRegistrationDates } from '../../../../../../hooks/useAdminEventRegistrationDates'
import { applyNewGroupsToDogEventDates } from '../../../../../../lib/event'
import AutocompleteMulti from '../../../../../components/AutocompleteMulti'
import { adminEventTypeGroupsSelector } from '../../../../recoil'

type Props = Pick<SectionProps, 'disabled' | 'event' | 'onChange'>

export const EventGroups = ({ disabled, event, onChange }: Readonly<Props>) => {
  const { t } = useTranslation()
  const options = useAdminEventDatesOptions(event)
  const defaultDates = useAdminEventRegistrationDates(event)
  const typeGroups = useRecoilValue(adminEventTypeGroupsSelector(event.eventType))
  const defaultGroups = useMemo(() => typeGroups.filter((g) => g !== 'kp'), [typeGroups])

  const value: RegistrationDate[] = useMemo(
    () =>
      applyNewGroupsToDogEventDates(
        event,
        defaultGroups,
        event.dates?.filter((d): d is RegistrationDate => !!d.date && !!d.time) ?? defaultDates
      ).dates ?? defaultDates,
    [defaultDates, defaultGroups, event]
  )

  const getGroupLabel = useCallback(
    (o: RegistrationDate) =>
      t('dateFormat.weekday', { date: o.date }) + (o.time ? ' ' + t(`registration.timeLong.${o.time}`) : ''),
    [t]
  )

  const handleChange = useCallback(
    (e: SyntheticEvent<Element, Event>, newValue: RegistrationDate[], _reason: AutocompleteChangeReason) => {
      onChange?.(applyNewGroupsToDogEventDates(event, defaultGroups, newValue))
    },
    [defaultGroups, event, onChange]
  )

  useEffect(() => {
    if (typeGroups.length <= 1) return

    const lengthChanged = event.dates?.length !== value.length
    const dateChanged = !lengthChanged && event.dates?.some((v, i) => value[i].date.valueOf() !== v.date.valueOf())
    if (lengthChanged || dateChanged) {
      onChange?.({ classes: [], dates: value })
    }
  }, [event.dates, onChange, typeGroups.length, value])

  if (typeGroups.length <= 1) return null

  return (
    <Stack direction="row" gap={1} alignItems="center">
      <AutocompleteMulti
        disabled={disabled}
        label={t('registration.dates')}
        getOptionLabel={getGroupLabel}
        isOptionEqualToValue={(o, v) => o.date?.valueOf() === v.date?.valueOf() && o.time === v.time}
        onChange={handleChange}
        options={options}
        value={value}
      />
    </Stack>
  )
}
