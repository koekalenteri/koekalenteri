import type { EventType, Judge, PublicJudge } from '../../../../../types'
import type { JudgesEvent, SectionProps } from '../types'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { judgesMockTrialIndependently } from '../../../../../lib/judge'
import AutocompleteSingle from '../../../../components/AutocompleteSingle'
import JudgeClasses from './JudgeClasses'
import { filterClassesByJudgeId, filterJudges, updateJudge } from './utils'

interface Props extends Pick<SectionProps, 'disabled' | 'onChange'> {
  readonly event: JudgesEvent
  readonly judges: Judge[]
  readonly selectedEventType?: EventType
  readonly judge: PublicJudge
  readonly index: number
}

export const OfficialJudge = ({ event, judge, index, selectedEventType, judges, disabled, onChange }: Props) => {
  const { t } = useTranslation()

  const title = selectedEventType?.official && index === 0 ? t('judgeChief') : `${t('judge')} ${index + 1}`
  const value = judges.find((j) => j.id === judge.id)
  // On a Mock trial the secretary sees which judges may judge it on their own (KOE-1357).
  const getOptionLabel = useCallback(
    (option?: Judge) => {
      if (!option?.name) return ''
      return event.mockTrial && judgesMockTrialIndependently(option)
        ? `${option.name} (${t('judgeMockTrial')})`
        : option.name
    },
    [event.mockTrial, t]
  )

  return (
    <Grid
      container
      spacing={1}
      sx={{
        alignItems: 'center',
        width: '100%',
      }}
    >
      <Grid sx={{ width: 300 }}>
        <AutocompleteSingle
          disabled={disabled}
          value={value}
          label={title}
          error={!!judge.id && !value}
          helperText={judge.id && !value ? `Tuomari ${judge.name} (${judge.id}) ei ole käytettävissä` : ''}
          getOptionLabel={getOptionLabel}
          options={filterJudges(judges, event.judges, judge.id, selectedEventType, event.mockTrial)}
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
              classes: updateJudge(event, judge?.id, newJudge, filterClassesByJudgeId(event.classes, oldJudge.id)),
              judges: newJudges,
            })
          }}
        />
      </Grid>
      <JudgeClasses disabled={disabled} event={event} index={index} judge={judge} onChange={onChange} />
      <Grid>
        <Button
          startIcon={<DeleteOutline />}
          disabled={disabled || (selectedEventType?.official && index === 0)}
          onClick={() =>
            onChange?.({
              classes: updateJudge(event, judge.id, undefined, []),
              judges: event.judges.filter((j) => j !== judge),
            })
          }
        >
          Poista tuomari
        </Button>
      </Grid>
    </Grid>
  )
}
