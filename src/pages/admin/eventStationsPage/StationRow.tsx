import type { EventStation, PublicJudge } from '../../../types'
import type { StationsEditorEvent } from './StationsEditor'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
const TASK_COUNTS: EventStation['tasks'][] = [1, 2]

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
  const handleTasksChange = useCallback((tasks: EventStation['tasks']) => onChange({ tasks }), [onChange])

  return (
    <Grid container spacing={1} alignItems="center" width="100%">
      <Grid sx={{ width: 90 }}>
        <Typography color={disabled ? 'text.disabled' : 'text.primary'}>
          {t('event.station')} {station.number}
        </Typography>
      </Grid>
      <Grid sx={{ width: 120 }}>
        <AutocompleteSingle
          disableClearable
          disabled={disabled}
          label={t('event.stationTasks')}
          onChange={handleTasksChange}
          options={TASK_COUNTS}
          value={station.tasks}
        />
      </Grid>
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
