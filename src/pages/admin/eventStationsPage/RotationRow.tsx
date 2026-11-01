import type { ReactNode } from 'react'
import type { EventRotationGroup, EventRotationPost, EventStation, RegistrationClass } from '@/types'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useTranslation } from 'react-i18next'
import { POST_PARTS, POST_TASK_COUNTS, stationParts, stationTaskCount } from '@/lib/rotation'

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
 * A visit as the group stores it. A value equal to the post's own default is left out, so the visit
 * follows the post when its default changes later.
 */
const visitOf = (station: EventStation, taskCount: number, parts: 1 | 2): EventRotationPost => ({
  stationId: station.id,
  ...(taskCount === stationTaskCount(station) ? {} : { taskCount }),
  ...(parts === stationParts(station) ? {} : { parts }),
})

/**
 * A visit's post picked anew. A post the group already visits elsewhere changes places with this one,
 * the two visits moving whole, tasks and parts with their posts, so a round is reordered without losing
 * anything and still visits each post once. A post the group does not visit takes this visit's place
 * and keeps what the group does at this point of its round. "Ei rastia" takes the visit out.
 */
const withPost = (posts: readonly EventRotationPost[], index: number, picked?: EventStation): EventRotationPost[] => {
  if (!picked) return posts.filter((_, at) => at !== index)
  const other = posts.findIndex((post) => post.stationId === picked.id)
  if (other === -1) return posts.map((post, at) => (at === index ? { ...post, stationId: picked.id } : post))
  return posts.map((post, at) => {
    if (at === index) return posts[other]
    if (at === other) return posts[index]
    return post
  })
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

const countItems = (counts: readonly number[]) =>
  counts.map((count) => (
    <MenuItem key={count} value={count}>
      {count}
    </MenuItem>
  ))

/**
 * One rotation group: its class, its start numbers where the class is split, and the posts it visits
 * in order, each with the tasks and parts it does there.
 */
export const RotationRow = ({ group, classes, stations, disabled, onChange, onRemove }: Props) => {
  const { t } = useTranslation()
  const unvisited = stations.filter((station) => !group.posts.some((post) => post.stationId === station.id))
  const setPosts = (posts: EventRotationPost[]) => onChange({ ...group, posts })

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
      {group.posts.map((post, index) => {
        const station = stations.find((item) => item.id === post.stationId)
        const taskCount = post.taskCount ?? (station ? stationTaskCount(station) : 1)
        const parts = post.parts ?? (station ? stationParts(station) : 1)
        const setVisit = (next: EventRotationPost) =>
          setPosts(group.posts.map((item, at) => (at === index ? next : item)))

        return (
          // A post appears in a round once at most, so it names its own place there. The visit's post on
          // top, what the group does there under it, so a round of several posts fits a row.
          <Stack key={post.stationId} spacing={0.5} sx={{ width: 164 }}>
            <RowSelect
              disabled={disabled}
              label={t('event.rotation.visit', { number: index + 1 })}
              onChange={(value) =>
                setPosts(
                  withPost(
                    group.posts,
                    index,
                    stations.find((item) => item.id === value)
                  )
                )
              }
              value={station ? station.id : ''}
            >
              {/* A group visits one post at least: the last visit goes with the group's own button. */}
              {group.posts.length > 1 && <MenuItem value="">{t('event.rotation.visitNone')}</MenuItem>}
              {stations.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {t('event.station')} {item.number}
                </MenuItem>
              ))}
            </RowSelect>
            <Stack direction="row" spacing={0.5}>
              <RowSelect
                disabled={disabled || !station}
                label={t('event.stationTaskCount')}
                onChange={(value) => station && setVisit(visitOf(station, Number(value), parts))}
                value={taskCount}
                width={80}
              >
                {countItems(POST_TASK_COUNTS)}
              </RowSelect>
              <RowSelect
                disabled={disabled || !station}
                label={t('event.stationParts')}
                onChange={(value) => {
                  const picked = POST_PARTS.find((item) => item === Number(value))
                  if (station && picked) setVisit(visitOf(station, taskCount, picked))
                }}
                value={parts}
                width={80}
              >
                {countItems(POST_PARTS)}
              </RowSelect>
            </Stack>
          </Stack>
        )
      })}
      {unvisited.length > 0 && (
        <IconButton
          aria-label={t('event.rotation.visitAdd')}
          disabled={disabled}
          onClick={() => setPosts([...group.posts, { stationId: unvisited[0].id }])}
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
