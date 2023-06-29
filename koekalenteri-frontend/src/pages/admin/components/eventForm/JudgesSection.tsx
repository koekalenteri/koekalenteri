import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import { isSameDay } from 'date-fns'
import { ClassJudge, DeepPartial, EventClass, Judge } from 'koekalenteri-shared/model'

import AutocompleteSingle from '../../../components/AutocompleteSingle'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { SectionProps } from '../EventForm'

import EventClasses from './components/EventClasses'
import { validateEventField } from './validation'

function filterJudges(judges: Judge[], eventJudges: number[], id: number | undefined, eventType?: string) {
  return judges
    .filter((j) => !eventType || j.eventTypes.includes(eventType))
    .filter((j) => j.id === id || !eventJudges.includes(j.id))
}

function hasJudge(c: DeepPartial<EventClass>, id?: number) {
  return Array.isArray(c.judge) ? c.judge.find((j) => j.id === id) : c.judge?.id === id
}

function filterClassesByJudgeId(classes?: EventClass[], id?: number) {
  return classes?.filter((c) => hasJudge(c, id))
}

interface Props extends SectionProps {
  judges: Judge[]
}

export default function JudgesSection({ event, disabled, judges, fields, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const list = event.judges
  const validationError = useMemo(
    () => event && fields?.required.judges && validateEventField(event, 'judges', true),
    [event, fields?.required.judges]
  )
  const error = useMemo(
    () => !!validationError || list.some((id) => id && !judges.find((j) => j.id === id)),
    [judges, list, validationError]
  )
  const helperText = useMemo(() => {
    if (validationError) {
      return t(`validation.event.${validationError.key}`, {
        ...validationError.opts,
        state: fields?.state?.judges ?? 'draft',
      })
    }
    return error ? t('validation.event.errors') : ''
  }, [error, fields?.state?.judges, t, validationError])

  const toArray = (j?: DeepPartial<ClassJudge>): DeepPartial<ClassJudge[]> => (j ? [j] : [])
  const makeArray = (j?: DeepPartial<ClassJudge | ClassJudge[]>) => (Array.isArray(j) ? [...j] : toArray(j))
  const selectJudge = (j?: DeepPartial<ClassJudge | ClassJudge[]>, id?: number): DeepPartial<ClassJudge[]> => {
    const judge = id ? { id, name: judges.find((j) => j.id === id)?.name ?? '' } : undefined
    const a = makeArray(j)
    if (judge && !a.find((cj) => cj.id === id)) {
      a.push(judge)
    }
    return a
  }
  const removeJudge = (j?: DeepPartial<ClassJudge | ClassJudge[]>, id?: number): DeepPartial<ClassJudge[]> => {
    const a = makeArray(j)
    return a.filter((cj) => cj.id !== id)
  }
  const updateJudge = (id: number | undefined, values?: DeepPartial<EventClass>[]) => {
    const isSelected = (c: DeepPartial<EventClass>) =>
      values?.find(
        (v) => event && isSameDay(v.date ?? event.startDate, c.date ?? event.startDate) && v.class === c.class
      )
    return event.classes?.map((c) => ({
      ...c,
      judge: isSelected(c) ? selectJudge(c.judge, id) : removeJudge(c.judge, id),
    }))
  }

  return (
    <CollapsibleSection
      title={t('judges')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid item container spacing={1}>
        {list.map((id, index) => {
          const title = index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`
          const value = judges.find((j) => j.id === id)
          return (
            <Grid key={id} item container spacing={1} alignItems="center">
              <Grid item sx={{ width: 300 }}>
                <AutocompleteSingle
                  disabled={disabled}
                  value={value}
                  label={title}
                  error={!!id && !value}
                  helperText={!!id && !value ? `Tuomari ${id} ei ole käytettävissä` : ''}
                  getOptionLabel={(o) => o?.name || ''}
                  options={filterJudges(judges, event.judges, id, event.eventType)}
                  onChange={(value) => {
                    const newId = value?.id
                    const newJudges = [...event.judges]
                    const oldId = newJudges.splice(index, 1)[0]
                    if (newId) {
                      newJudges.splice(index, 0, newId)
                    }
                    onChange?.({
                      judges: newJudges,
                      classes: updateJudge(newId, filterClassesByJudgeId(event.classes, oldId)),
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
                  value={filterClassesByJudgeId(event.classes, id)}
                  classes={[...event.classes]}
                  label="Arvostelee koeluokat"
                  onChange={(_e, values) =>
                    onChange?.({
                      classes: updateJudge(id, values),
                    })
                  }
                />
              </Grid>
              <Grid item>
                <Button
                  startIcon={<DeleteOutline />}
                  disabled={disabled}
                  onClick={() =>
                    onChange?.({
                      judges: event.judges.filter((j) => j !== id),
                      classes: event.classes.map((c) => (hasJudge(c, id) ? { ...c, judge: undefined } : c)),
                    })
                  }
                >
                  Poista tuomari
                </Button>
              </Grid>
            </Grid>
          )
        })}
        <Grid item>
          <Button
            disabled={disabled}
            startIcon={<AddOutlined />}
            onClick={() => onChange?.({ judges: [...event.judges].concat(0) })}
          >
            Lisää tuomari
          </Button>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
