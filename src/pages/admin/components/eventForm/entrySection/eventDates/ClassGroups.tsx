import type { AutocompleteChangeReason } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { RegistrationClass, RegistrationDate } from '../../../../../../types'
import type { EntryEvent, SectionProps } from '../../types'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { useAtomValue } from 'jotai'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { applyNewGroupsToDogEventClass } from '../../../../../../lib/event'
import AutocompleteMulti from '../../../../../components/AutocompleteMulti'
import { adminEventTypeGroupsAtom } from '../../../../state'

interface Props extends Pick<SectionProps, 'disabled' | 'onChange'> {
  readonly event: EntryEvent
  eventClass: RegistrationClass
  readonly error?: boolean
  readonly helperText?: string
}

export const ClassGroups = ({ disabled, error, event, eventClass, helperText, onChange }: Readonly<Props>) => {
  const { t } = useTranslation()
  const typeGroups = useAtomValue(adminEventTypeGroupsAtom(event.eventType))
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
    (o: RegistrationDate) => {
      const timeText = o.time ? t(`registration.timeLong.${o.time}`) : ''
      return t('dateFormat.weekday', { date: o.date }) + (timeText ? ` ${timeText}` : '')
    },
    [t]
  )

  const handleChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, value: RegistrationDate[], _reason: AutocompleteChangeReason) => {
      onChange?.(applyNewGroupsToDogEventClass(event, eventClass, defaultGroups, value))
    },
    [defaultGroups, event, eventClass, onChange]
  )

  return (
    <Stack direction="row" gap={1} alignItems="center" key={eventClass}>
      <Box minWidth={40}>{eventClass}</Box>
      <AutocompleteMulti
        disabled={disabled}
        error={error}
        helperText={helperText}
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
