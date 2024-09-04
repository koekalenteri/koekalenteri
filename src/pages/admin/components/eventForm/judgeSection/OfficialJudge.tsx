import type { EventType, Judge, PublicJudge } from '../../../../../types'
import type { SectionProps } from '../../EventForm'

import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Grid2 from '@mui/material/Grid2'

import AutocompleteSingle from '../../../../components/AutocompleteSingle'

import JudgeClasses from './JudgeClasses'
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
    <Grid2 container spacing={1} alignItems="center">
      <Grid2 sx={{ width: 300 }}>
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
      </Grid2>
      <JudgeClasses disabled={disabled} event={event} index={index} judge={judge} onChange={onChange} />
      <Grid2>
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
      </Grid2>
    </Grid2>
  )
}
