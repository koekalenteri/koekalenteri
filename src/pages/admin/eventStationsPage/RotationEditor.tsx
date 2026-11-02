import type { DayKey, EventRotationGroup, RegistrationClass } from '@/types'
import type { StationsEditorEvent } from './StationsEditor'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { compareRegistrationClasses } from '@/lib/event'
import {
  dayStations,
  formatRotationGroup,
  formatStationArrivals,
  nextRotationGroup,
  rotationGroupDay,
  rotationWarnings,
} from '@/lib/rotation'
import { RotationRow } from './RotationRow'

interface Props {
  readonly day: DayKey
  readonly event: StationsEditorEvent
  readonly disabled?: boolean
  /** One level below the day's heading, or below the page's where a one-day trial has none. */
  readonly heading: 'h2' | 'h3'
  /** The event's whole list of groups, this day's edited and the other days' as they were. */
  readonly onChange: (rotations: EventRotationGroup[]) => void
}

/**
 * The running orders of one day (KOE-1665): its groups, each a class or a range of its start numbers and
 * its exercises in order, a warning where a group has other than four or five, and below them each post
 * as the groups reach it. Without a group of its own a class does one exercise at each of the day's
 * posts in number order, which is what the page says while there is none.
 */
export const RotationEditor = ({ day, event, disabled, heading, onChange }: Props) => {
  const { t } = useTranslation()
  const rotations = useMemo(() => event.rotations ?? [], [event.rotations])
  const stations = useMemo(() => dayStations(event, day), [day, event])
  const classes = useMemo(
    () =>
      [...new Set(event.classes.filter((item) => item.date === day).map((item): RegistrationClass => item.class))].sort(
        compareRegistrationClasses
      ),
    [day, event.classes]
  )
  // Each with its place in the event's list, which is what an edit replaces. A group has no id, and a
  // key made of what it holds would change, and remount the row, with every digit typed into its range;
  // its turn among the day's groups stays put while it is edited. A group with no exercise has no day,
  // a group stored in dev before the running order among them: it shows on the first day, to be removed.
  const groups = useMemo(
    () =>
      rotations
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => (rotationGroupDay(event, group) || event.startDate) === day)
        .map((item, turn) => ({ ...item, key: `${day}:${turn}` })),
    [day, event, rotations]
  )
  const warnings = useMemo(
    () =>
      rotationWarnings(event).flatMap((warning) => {
        const group = rotations[warning.group]
        return groups.some((item) => item.index === warning.group)
          ? [
              {
                index: warning.group,
                text: t('event.rotation.warning.exerciseCount', {
                  count: warning.count,
                  group: formatRotationGroup(group, t),
                }),
              },
            ]
          : []
      }),
    [event, groups, rotations, t]
  )

  if (stations.length === 0) return null

  const replace = (index: number, group?: EventRotationGroup) =>
    onChange(
      group ? rotations.map((item, at) => (at === index ? group : item)) : rotations.filter((_, at) => at !== index)
    )

  const add = () =>
    onChange([
      ...rotations,
      nextRotationGroup(
        stations,
        classes,
        groups.map(({ group }) => group)
      ),
    ])

  return (
    <Stack spacing={1} sx={{ mt: 1, width: '100%' }}>
      <Typography variant="subtitle2" component={heading}>
        {t('event.rotation.title')}
      </Typography>
      {groups.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('event.rotation.default')}
        </Typography>
      )}
      {groups.map(({ group, index, key }) => (
        <RotationRow
          classes={classes}
          disabled={disabled}
          group={group}
          key={key}
          onChange={(next) => replace(index, next)}
          onRemove={() => replace(index)}
          stations={stations}
        />
      ))}
      {warnings.length > 0 && (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ color: 'warning.dark' }}>
            {t('event.rotation.warningsTitle')}
          </Typography>
          {warnings.map((warning) => (
            <Typography key={warning.index} variant="body2" sx={{ color: 'warning.dark' }}>
              {warning.text}
            </Typography>
          ))}
        </Stack>
      )}
      <div>
        <Button disabled={disabled || classes.length === 0} onClick={add} startIcon={<AddOutlined />}>
          {t('event.rotation.add')}
        </Button>
      </div>
      <Stack spacing={0.25}>
        {stations.map((station) => (
          <Typography key={station.id} variant="body2">
            {formatStationArrivals(event, station, t)}
          </Typography>
        ))}
      </Stack>
    </Stack>
  )
}
