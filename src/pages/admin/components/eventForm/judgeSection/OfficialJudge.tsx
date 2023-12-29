import type { EventType, Judge, PublicJudge } from '../../../../../types'
import type { SectionProps } from '../../EventForm'

import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'

import AutocompleteSingle from '../../../../components/AutocompleteSingle'
import EventClasses from '../components/EventClasses'

import { filterClassesByJudgeId, filterJudges, hasJudge, updateJudge } from './utils'

interface Props extends Pick<SectionProps, 'event' | 'disabled' | 'onChange'> {
  readonly judges: Judge[]
  readonly selectedEventType?: EventType
  readonly judge: PublicJudge
  readonly index: number
}

export const OfficialJudge = ({ event, judge, index, selectedEventType, judges, disabled, onChange }: Props) => {
  const { t } = useTranslation()

  const title = selectedEventType?.official && index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`
  const value = judges.find((j) => j.id === judge.id)

  return (
    <Grid key={judge.id || judge.name || index} item container spacing={1} alignItems="center">
      <Grid item sx={{ width: 300 }}>
        <AutocompleteSingle
          disabled={disabled}
          value={value}
          label={title}
          error={!!judge.id && !value}
          helperText={!!judge.id && !value ? `Tuomari ${judge.name} (${judge.id}) ei ole käytettävissä` : ''}
          getOptionLabel={(o) => o?.name || ''}
          options={filterJudges(judges, event.judges, judge.id, selectedEventType)}
          onChange={(value) => {
            const newJudge: PublicJudge | undefined = value
              ? { id: value.id, name: value.name, official: true }
              : undefined
            const newJudges = [...event.judges]
            const oldJudge = newJudges.splice(index, 1)[0]
            if (newJudge) {
              newJudges.splice(index, 0, newJudge)
            }
            onChange?.({
              judges: newJudges,
              classes: updateJudge(event, newJudge?.id, newJudge, filterClassesByJudgeId(event.classes, oldJudge.id)),
            })
          }}
        />
      </Grid>
      <Grid item sx={{ width: 300 }} display={event.eventType === 'NOWT' ? 'NONE' : undefined}>
        <EventClasses
          id={`class${index}`}
          disabled={disabled}
          eventStartDate={event.startDate}
          eventEndDate={event.endDate}
          value={filterClassesByJudgeId(event.classes, judge.id)}
          classes={[...event.classes]}
          label="Arvostelee luokat"
          onChange={(_e, values) =>
            onChange?.({
              classes: updateJudge(event, judge.id, judge, [...values]),
            })
          }
        />
      </Grid>
      <Grid item>
        <Button
          startIcon={<DeleteOutline />}
          disabled={disabled || (selectedEventType?.official && index === 0)}
          onClick={() =>
            onChange?.({
              judges: event.judges.filter((j) => j !== judge),
              classes: event.classes.map((c) => (hasJudge(c, judge.id) ? { ...c, judge: undefined } : c)),
            })
          }
        >
          Poista tuomari
        </Button>
      </Grid>
    </Grid>
  )
}
