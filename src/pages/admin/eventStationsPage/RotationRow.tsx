import type { ReactNode } from 'react'
import type { ExerciseSettings } from '@/lib/rotation'
import type { EventExercise, EventRotationGroup, EventStation, RegistrationClass } from '@/types'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useTranslation } from 'react-i18next'
import { DOG_COUNTS } from '@/lib/liveFormat'
import { exerciseOf, exerciseSettingsOf, groupExercises, POST_PARTS } from '@/lib/rotation'

interface Props {
  readonly group: EventRotationGroup
  /** The classes of the day, which a group may be. */
  readonly classes: RegistrationClass[]
  /** The posts of the day, in number order. */
  readonly stations: EventStation[]
  readonly disabled?: boolean
  readonly onChange: (group: EventRotationGroup) => void
  readonly onRemove: () => void
}

/** A typed start number, or none for an empty or unreadable field. */
const numberOf = (text: string): number | undefined => {
  const value = Number.parseInt(text, 10)
  return Number.isNaN(value) ? undefined : value
}

/** A number range field's value as the group stores it: absent rather than empty. */
const withNumber = (
  group: EventRotationGroup,
  key: 'firstNumber' | 'lastNumber',
  value: number | undefined
): EventRotationGroup => {
  const { [key]: _old, ...rest } = group
  return value === undefined ? rest : { ...rest, [key]: value }
}

/**
 * An exercise's post picked anew. The column keeps what it shows: its parts and dogs at once are read
 * off the old post, its defaults included, and stored against the new one, so moving an exercise does
 * not change it. "Poista rasti" takes the exercise out.
 */
const withPost = (
  exercises: readonly EventExercise[],
  index: number,
  stations: readonly EventStation[],
  picked?: EventStation
): EventExercise[] => {
  if (!picked) return exercises.filter((_, at) => at !== index)
  const old = stations.find((station) => station.id === exercises[index].stationId)
  const moved = old ? exerciseOf(picked, exerciseSettingsOf(old, exercises[index])) : { stationId: picked.id }
  return exercises.map((exercise, at) => (at === index ? moved : exercise))
}

interface SelectProps {
  readonly label: string
  readonly value: string | number
  readonly width?: number
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
  readonly children: ReactNode
}

/** The row's one kind of select, so each field says only what differs. */
const RowSelect = ({ label, value, width, disabled, onChange, children }: SelectProps) => (
  <TextField
    disabled={disabled}
    label={label}
    onChange={(event) => onChange(event.target.value)}
    select
    size="small"
    sx={width ? { width } : undefined}
    value={value}
  >
    {children}
  </TextField>
)

/** What an exercise at a post the day no longer has shows: its fields are disabled until a post is picked. */
const UNKNOWN_POST_SETTINGS: ExerciseSettings = { dogsAtOnce: 1, parts: 1 }

const countItems = (counts: readonly number[]) =>
  counts.map((count) => (
    <MenuItem key={count} value={count}>
      {count}
    </MenuItem>
  ))

/**
 * One group: its class, its start numbers where the class is split, and its running order, an exercise
 * a column, each at a post with its parts and dogs at once (KOE-1665). A post may come more than once.
 */
export const RotationRow = ({ group, classes, stations, disabled, onChange, onRemove }: Props) => {
  const { t } = useTranslation()
  const exercises = groupExercises(group)
  const setExercises = (next: EventExercise[]) => onChange({ ...group, exercises: next })
  // A new exercise goes to the post of the last one: two exercises in a row at one post is the usual
  // reason to add one, and another post is one pick away.
  const added = exercises.at(-1)?.stationId ?? stations[0]?.id

  const numberField = (key: 'firstNumber' | 'lastNumber') => (
    <TextField
      disabled={disabled}
      label={t(`event.rotation.${key}`)}
      onChange={(event) => onChange(withNumber(group, key, numberOf(event.target.value)))}
      size="small"
      // Shrunk, the label fits the field however long the language makes it.
      slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' }, inputLabel: { shrink: true } }}
      sx={{ width: 96 }}
      value={group[key] ?? ''}
    />
  )

  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ alignItems: 'flex-start', flexWrap: 'wrap', py: 0.5, width: '100%' }}
    >
      <RowSelect
        disabled={disabled}
        label={t('event.rotation.class')}
        onChange={(value) => {
          const picked = classes.find((item) => item === value)
          if (picked) onChange({ ...group, class: picked })
        }}
        value={classes.includes(group.class) ? group.class : ''}
        width={90}
      >
        {classes.map((item) => (
          <MenuItem key={item} value={item}>
            {item}
          </MenuItem>
        ))}
      </RowSelect>
      {numberField('firstNumber')}
      {numberField('lastNumber')}
      {exercises.map((exercise, index) => {
        const station = stations.find((item) => item.id === exercise.stationId)
        const settings = station ? exerciseSettingsOf(station, exercise) : UNKNOWN_POST_SETTINGS
        const setExercise = (change: Partial<ExerciseSettings>) =>
          station &&
          setExercises(
            exercises.map((item, at) => (at === index ? exerciseOf(station, { ...settings, ...change }) : item))
          )

        return (
          // A column is the exercise's place in the order: the same post may be in several columns. Its
          // post on top, its parts and dogs at once under it, so an order of five fits a row.
          // biome-ignore lint/suspicious/noArrayIndexKey: the place in the order is what a column is
          <Stack key={index} spacing={0.5} sx={{ width: 184 }}>
            <RowSelect
              disabled={disabled}
              label={t('event.rotation.visit', { number: index + 1 })}
              onChange={(value) =>
                setExercises(
                  withPost(
                    exercises,
                    index,
                    stations,
                    stations.find((item) => item.id === value)
                  )
                )
              }
              value={station ? station.id : ''}
            >
              {/* A group has one exercise at least: the last one goes with the group's own button. */}
              {exercises.length > 1 && <MenuItem value="">{t('event.rotation.visitNone')}</MenuItem>}
              {stations.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {t('event.station')} {item.number}
                </MenuItem>
              ))}
            </RowSelect>
            <Stack direction="row" spacing={0.5}>
              <RowSelect
                disabled={disabled || !station}
                label={t('event.stationParts')}
                onChange={(value) => {
                  const picked = POST_PARTS.find((item) => item === Number(value))
                  if (picked) setExercise({ parts: picked })
                }}
                value={settings.parts}
                width={78}
              >
                {countItems(POST_PARTS)}
              </RowSelect>
              {/* Rotation is only for the types scored at posts, and none of them fixes the figure. */}
              <RowSelect
                disabled={disabled || !station}
                label={t('event.stationDogsAtOnce')}
                onChange={(value) => setExercise({ dogsAtOnce: Number(value) })}
                value={settings.dogsAtOnce}
                width={102}
              >
                {countItems(DOG_COUNTS)}
              </RowSelect>
            </Stack>
          </Stack>
        )
      })}
      {added && (
        <IconButton
          aria-label={t('event.rotation.visitAdd')}
          disabled={disabled}
          onClick={() => setExercises([...exercises, { stationId: added }])}
        >
          <AddOutlined />
        </IconButton>
      )}
      <IconButton aria-label={t('event.rotation.remove')} disabled={disabled} onClick={onRemove}>
        <DeleteOutline />
      </IconButton>
    </Stack>
  )
}
