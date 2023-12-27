import type { ClassJudge, DeepPartial, EventClass, EventType, Judge, PublicJudge } from '../../../../types'
import type { SectionProps } from '../EventForm'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import { isSameDay } from 'date-fns'

import AutocompleteSingle from '../../../components/AutocompleteSingle'
import CollapsibleSection from '../../../components/CollapsibleSection'

import EventClasses from './components/EventClasses'
import { validateEventField } from './validation'

function filterJudges(judges: Judge[], eventJudges: PublicJudge[], id: number | undefined, eventType?: EventType) {
  return judges
    .filter((j) => !eventType?.official || j.eventTypes.includes(eventType.eventType))
    .filter((j) => j.id === id || !eventJudges.find((ej) => ej.id === j.id))
}

function hasJudge(c: DeepPartial<EventClass>, id?: number) {
  return Array.isArray(c.judge) ? c.judge.find((j) => j.id === id) : c.judge?.id === id
}

function filterClassesByJudgeId(classes?: EventClass[], id?: number) {
  return classes?.filter((c) => hasJudge(c, id))
}

interface Props extends Readonly<SectionProps> {
  readonly judges: Judge[]
  readonly selectedEventType?: EventType
}

type PartialClassJudge = Partial<ClassJudge>
type PartialClassJudgeValue = PartialClassJudge | PartialClassJudge[]

export default function JudgesSection({
  event,
  disabled,
  judges,
  fields,
  onChange,
  onOpenChange,
  open,
  selectedEventType,
}: Props) {
  const { t } = useTranslation()
  const list = event.judges
  const validationError = useMemo(
    () => event && fields?.required.judges && validateEventField(event, 'judges', true),
    [event, fields?.required.judges]
  )
  const error = useMemo(
    () => !!validationError || list.some((ej) => ej.id && !judges.find((j) => j.id === ej.id)),
    [judges, list, validationError]
  )
  const helperText: string = useMemo(() => {
    if (validationError) {
      return t(`validation.event.${validationError.key}`, {
        ...validationError.opts,
        state: fields?.state?.judges ?? 'draft',
      })
    }
    return error ? t('validation.event.errors') : ''
  }, [error, fields?.state?.judges, t, validationError])

  const toArray = (j?: Partial<ClassJudge>): PartialClassJudge[] => (j ? [j] : [])
  const makeArray = (j?: PartialClassJudgeValue) => (Array.isArray(j) ? [...j] : toArray(j))
  const selectJudge = (j?: PartialClassJudgeValue, id?: number): PartialClassJudge[] => {
    const judge = id ? { id, name: judges.find((j) => j.id === id)?.name ?? '' } : undefined
    const a = makeArray(j)
    if (judge && !a.find((cj) => cj.id === id)) {
      a.push(judge)
    }
    return a
  }
  const removeJudge = (j?: PartialClassJudgeValue, id?: number): PartialClassJudge[] => {
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
        {list.map((judge, index) => {
          const title = index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`
          const value = judges.find((j) => j.id === judge.id)
          return (
            <Grid key={judge.id ?? judge.name ?? index} item container spacing={1} alignItems="center">
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
                      classes: updateJudge(newJudge?.id, filterClassesByJudgeId(event.classes, oldJudge.id)),
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
                      classes: updateJudge(judge.id, [...values]),
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
                      judges: event.judges.filter((j) => j.id !== judge.id),
                      classes: event.classes.map((c) => (hasJudge(c, judge.id) ? { ...c, judge: undefined } : c)),
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
            onClick={() => onChange?.({ judges: [...event.judges].concat({ id: 0, name: '' }) })}
          >
            Lisää tuomari
          </Button>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
