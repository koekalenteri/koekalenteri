import type { AutocompleteChangeReason } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { RegistrationClass, RegistrationDate } from '../../../../../../types'
import type { SectionProps } from '../../../EventForm'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { useRecoilValue } from 'recoil'

import AutocompleteMulti from '../../../../../components/AutocompleteMulti'
import { eventTypeGroupsSelector } from '../../../../recoil'

interface Props extends Pick<SectionProps, 'event' | 'onChange'> {
  eventClass: RegistrationClass
}

export const ClassGroups = ({ event, eventClass, onChange }: Readonly<Props>) => {
  const { t } = useTranslation()
  const typeGroups = useRecoilValue(eventTypeGroupsSelector(event.eventType))
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
      const newClasses = event.classes.map((c) => ({
        ...c,
        groups: c.class === eventClass ? [] : c.groups ?? defaultGroups,
      }))
      value.forEach((cg) => {
        newClasses.find((c) => c.date === cg.date)?.groups?.push(cg.time ?? 'kp')
      })
      // kp is a special group that can not exist with other groups
      // for those classes that previously included 'kp' and now include something more, remove 'kp'
      classes
        .filter((c) => c.groups?.includes('kp'))
        .forEach((c) => {
          const nc = newClasses.find((nc) => nc.class === eventClass && nc.date === c.date)
          if (nc?.groups) {
            if (nc.groups.length > 1) {
              // another group was added, remove kp
              nc.groups = nc.groups.filter((g) => g !== 'kp')
            }

            if (nc.groups.length === 0) {
              // kp was removed, restore defaults
              nc.groups = [...defaultGroups]
            }
          }
        })
      // for those classes that still include 'kp' or are empty, select 'kp'
      newClasses.forEach((c) => {
        if (c.groups?.includes('kp') || (c.groups?.length ?? 0) == 0) {
          c.groups = ['kp']
        }
      })

      onChange?.({ classes: newClasses })
    },
    [classes, defaultGroups, event.classes, eventClass, onChange]
  )

  return (
    <Stack direction="row" gap={1} alignItems="center" key={eventClass}>
      <Box minWidth={40}>{eventClass}</Box>
      <AutocompleteMulti
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
