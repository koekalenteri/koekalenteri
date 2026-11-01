import type { EventStation, PublicJudge } from '@/types'
import type { StationsEditorEvent } from './StationsEditor'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { liveFormat, MAX_DOGS_AT_ONCE, stationDogsAtOnce } from '@/lib/liveFormat'
import { POST_PARTS, POST_TASK_COUNTS, stationParts } from '@/lib/rotation'
import AutocompleteMulti from '../../components/AutocompleteMulti'
import AutocompleteSingle from '../../components/AutocompleteSingle'

interface Props {
  readonly disabled?: boolean
  readonly event: StationsEditorEvent
  readonly station: EventStation
  readonly onChange: (changes: Partial<EventStation>) => void
  readonly onRemove: () => void
}

const judgeLabel = (judge?: PublicJudge) => judge?.name ?? ''
const sameJudge = (a: PublicJudge, b: PublicJudge) => a.id === b.id
/** One, a pair task, a walk-up — and room for a wider one without a code change. */
const DOG_COUNTS: number[] = Array.from({ length: MAX_DOGS_AT_ONCE }, (_unused, index) => index + 1)

export const StationRow = ({ event, station, disabled, onChange, onRemove }: Props) => {
  const { t } = useTranslation()

  // A judge removed from the event roster should stop appearing here. Filtering the displayed value
  // rather than writing a correction keeps this render read-only; the next edit persists the filtered
  // set anyway.
  const judges = useMemo(
    () => (station.judges ?? []).filter((judge) => event.judges.some((rosterJudge) => rosterJudge.id === judge.id)),
    [event.judges, station.judges]
  )

  const handleJudgesChange = useCallback((value: PublicJudge[]) => onChange({ judges: value }), [onChange])
  const handlePartsChange = useCallback((parts: 1 | 2) => onChange({ parts }), [onChange])
  // One is the default and is left out, as an optional field is: absent, never stored as a value of its own.
  const handleTaskCountChange = useCallback(
    (taskCount: number) => onChange({ taskCount: taskCount > 1 ? taskCount : undefined }),
    [onChange]
  )
  const handleDogsChange = useCallback((dogsAtOnce: number) => onChange({ dogsAtOnce }), [onChange])

  // Asked only where the format leaves it to the post. NOME-A runs four whatever anyone types here,
  // and NOU one, so offering the field there would be offering a lie.
  const asksDogsAtOnce = liveFormat(event.eventType).dogsAtOnce === undefined

  return (
    <Grid
      container
      spacing={1}
      sx={{
        alignItems: 'center',
        width: '100%',
      }}
    >
      <Grid sx={{ width: 90 }}>
        <Typography color={disabled ? 'text.disabled' : 'text.primary'}>
          {t('event.station')} {station.number}
        </Typography>
      </Grid>
      <Grid sx={{ width: 120 }}>
        <AutocompleteSingle
          disableClearable
          disabled={disabled}
          // Autocomplete wants a string for the option it shows; handed the number itself it says so on every render.
          getOptionLabel={String}
          label={t('event.stationTaskCount')}
          onChange={handleTaskCountChange}
          options={POST_TASK_COUNTS}
          value={station.taskCount ?? 1}
        />
      </Grid>
      <Grid sx={{ width: 120 }}>
        <AutocompleteSingle
          disableClearable
          disabled={disabled}
          getOptionLabel={String}
          label={t('event.stationParts')}
          onChange={handlePartsChange}
          options={POST_PARTS}
          value={stationParts(station)}
        />
      </Grid>
      {asksDogsAtOnce && (
        <Grid sx={{ width: 150 }}>
          <AutocompleteSingle
            disableClearable
            disabled={disabled}
            getOptionLabel={String}
            label={t('event.stationDogsAtOnce')}
            onChange={handleDogsChange}
            options={DOG_COUNTS}
            value={stationDogsAtOnce(event.eventType, station)}
          />
        </Grid>
      )}
      <Grid sx={{ flexGrow: 1, minWidth: 260 }}>
        <AutocompleteMulti
          disabled={disabled}
          getOptionLabel={judgeLabel}
          isOptionEqualToValue={sameJudge}
          label={t('event.stationJudges')}
          onChange={(_e, value) => handleJudgesChange(value)}
          options={event.judges}
          value={judges}
        />
      </Grid>
      <Grid>
        <Button disabled={disabled} onClick={onRemove} startIcon={<DeleteOutline />}>
          {t('event.stationRemove')}
        </Button>
      </Grid>
    </Grid>
  )
}
