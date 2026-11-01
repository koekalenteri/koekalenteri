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
 * One rotation group: its class, its start numbers where the class is split, and the posts it visits
 * in order, each with the tasks and parts it does there.
 */
export const RotationRow = ({ group, classes, stations, disabled, onChange, onRemove }: Props) => {
  const { t } = useTranslation()
  const stationOf = (post: EventRotationPost) => stations.find((station) => station.id === post.stationId)
  const unvisited = stations.filter((station) => !group.posts.some((post) => post.stationId === station.id))

  const setPost = (index: number, post?: EventRotationPost) =>
    onChange({
      ...group,
      posts: post
        ? group.posts.map((item, at) => (at === index ? post : item))
        : group.posts.filter((_, at) => at !== index),
    })

  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ alignItems: 'flex-start', flexWrap: 'wrap', py: 0.5, width: '100%' }}
    >
      <TextField
        disabled={disabled}
        label={t('event.rotation.class')}
        onChange={(event) => {
          const picked = classes.find((item) => item === event.target.value)
          if (picked) onChange({ ...group, class: picked })
        }}
        select
        size="small"
        sx={{ width: 90 }}
        value={classes.includes(group.class) ? group.class : ''}
      >
        {classes.map((item) => (
          <MenuItem key={item} value={item}>
            {item}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        disabled={disabled}
        label={t('event.rotation.firstNumber')}
        onChange={(event) => onChange(withNumber(group, 'firstNumber', numberOf(event.target.value)))}
        size="small"
        // Shrunk, the label fits the field however long the language makes it.
        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' }, inputLabel: { shrink: true } }}
        sx={{ width: 96 }}
        value={group.firstNumber ?? ''}
      />
      <TextField
        disabled={disabled}
        label={t('event.rotation.lastNumber')}
        onChange={(event) => onChange(withNumber(group, 'lastNumber', numberOf(event.target.value)))}
        size="small"
        // Shrunk, the label fits the field however long the language makes it.
        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' }, inputLabel: { shrink: true } }}
        sx={{ width: 96 }}
        value={group.lastNumber ?? ''}
      />
      {group.posts.map((post, index) => {
        const station = stationOf(post)
        const taskCount = post.taskCount ?? (station ? stationTaskCount(station) : 1)
        const parts = post.parts ?? (station ? stationParts(station) : 1)

        return (
          // A post appears in a round once at most, so it names its own place there. The visit's post on
          // top, what the group does there under it, so a round of several posts fits a row.
          <Stack key={post.stationId} spacing={0.5} sx={{ width: 164 }}>
            <TextField
              disabled={disabled}
              label={t('event.rotation.visit', { number: index + 1 })}
              onChange={(event) => {
                const picked = stations.find((item) => item.id === event.target.value)
                setPost(index, picked && visitOf(picked, taskCount, parts))
              }}
              select
              size="small"
              value={station ? station.id : ''}
            >
              <MenuItem value="">{t('event.rotation.visitNone')}</MenuItem>
              {/* A post appears in a round once at most: another visit's post is not on offer here. */}
              {stations
                .filter((item) => item.id === post.stationId || unvisited.includes(item))
                .map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {t('event.station')} {item.number}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction="row" spacing={0.5}>
              <TextField
                disabled={disabled || !station}
                label={t('event.stationTaskCount')}
                onChange={(event) => station && setPost(index, visitOf(station, Number(event.target.value), parts))}
                select
                size="small"
                sx={{ width: 80 }}
                value={taskCount}
              >
                {POST_TASK_COUNTS.map((count) => (
                  <MenuItem key={count} value={count}>
                    {count}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                disabled={disabled || !station}
                label={t('event.stationParts')}
                onChange={(event) => {
                  const picked = POST_PARTS.find((item) => item === Number(event.target.value))
                  if (station && picked) setPost(index, visitOf(station, taskCount, picked))
                }}
                select
                size="small"
                sx={{ width: 80 }}
                value={parts}
              >
                {POST_PARTS.map((count) => (
                  <MenuItem key={count} value={count}>
                    {count}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>
        )
      })}
      {unvisited.length > 0 && (
        <IconButton
          aria-label={t('event.rotation.visitAdd')}
          disabled={disabled}
          onClick={() => onChange({ ...group, posts: [...group.posts, { stationId: unvisited[0].id }] })}
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
