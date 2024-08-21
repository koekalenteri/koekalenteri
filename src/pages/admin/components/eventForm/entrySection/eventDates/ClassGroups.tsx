import type { AutocompleteChangeReason } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { RegistrationClass, RegistrationDate } from '../../../../../../types'
import type { SectionProps } from '../../../EventForm'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { useRecoilValue } from 'recoil'

import { applyNewGroupsToDogEventClass } from '../../../../../../lib/event'
import AutocompleteMulti from '../../../../../components/AutocompleteMulti'
import { adminEventTypeGroupsSelector } from '../../../../recoil'

interface Props extends Pick<SectionProps, 'disabled' | 'event' | 'onChange'> {
  eventClass: RegistrationClass
}

export const ClassGroups = ({ disabled, event, eventClass, onChange }: Readonly<Props>) => {
  const { t } = useTranslation()
  const typeGroups = useRecoilValue(adminEventTypeGroupsSelector(event.eventType))
  const defaultGroups = useMemo(() => typeGroups.filter((g) => g !== 'kp'), [typeGroups])
  const classes = useMemo(() => event.classes.filter((c) => c.class === eventClass), [event.classes, eventClass])
  const options = useMemo(
    () => classes.flatMap((c) => typeGroups.map((time) => ({ date: c.date, time }))),
    [classes, typeGroups]
  )
  const value = useMemo(
    () =>
      classes.flatMap<RegistrationDate>(
        (c) =>
          c.groups?.map<RegistrationDate>((time) => ({ date: c.date, time })) ??
          defaultGroups.map((time) => ({ date: c.date, time })) // by default all but kp are selected
      ),
    [classes, defaultGroups]
  )

  const getGroupLabel = useCallback(
    (o: RegistrationDate) =>
      t('dateFormat.weekday', { date: o.date }) + (o.time ? ' ' + t(`registration.timeLong.${o.time}`) : ''),
    [t]
  )

  const handleChange = useCallback(
    (e: SyntheticEvent<Element, Event>, value: RegistrationDate[], _reason: AutocompleteChangeReason) => {
      onChange?.(applyNewGroupsToDogEventClass(event, eventClass, defaultGroups, value))
    },
    [defaultGroups, event, eventClass, onChange]
  )

  return (
    <Stack direction="row" gap={1} alignItems="center" key={eventClass}>
      <Box minWidth={40}>{eventClass}</Box>
      <AutocompleteMulti
        disabled={disabled}
        label={t('registration.dates')}
        onChange={handleChange}
        isOptionEqualToValue={(o, v) => o.date?.valueOf() === v.date?.valueOf() && o.time === v.time}
        getOptionLabel={getGroupLabel}
        options={options}
        value={value}
      />
    </Stack>
  )
}
