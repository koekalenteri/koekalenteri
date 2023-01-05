import { useTranslation } from 'react-i18next'
import { AddOutlined, DeleteOutline } from '@mui/icons-material'
import { Button, Grid } from '@mui/material'
import { isSameDay } from 'date-fns'
import { EventClass, Judge } from 'koekalenteri-shared/model'

import { CollapsibleSection } from '../../../../components'
import { AutocompleteSingle } from '../../../../components/AutocompleteSingle'
import { SectionProps } from '../EventForm'

import EventClasses from './components/EventClasses'
import { validateEventField } from './validation'

function filterJudges(judges: Judge[], eventJudges: number[], id: number, eventType?: string) {
  return judges
    .filter(j => !eventType || j.eventTypes.includes(eventType))
    .filter(j => j.id === id || !eventJudges.includes(j.id))
}

interface Props extends SectionProps {
  judges: Judge[]
}

export default function JudgesSection({ event, judges, fields, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const list = event.judges
  const validationError = event && fields?.required.judges && validateEventField(event, 'judges', true)
  const error = !!validationError || list.some(id => !judges.find(j => j.id === id))
  const helperText = validationError
    ? t(`validation.event.${validationError.key}`, { ...validationError.opts, state: fields.state.judges || 'draft' })
    : error ? t('validation.event.errors') : ''

  const updateJudge = (id: number | undefined, values: EventClass[]) => {
    const judge = id ? { id, name: judges.find(j => j.id === id)?.name || '' } : undefined
    const isSelected = (c: EventClass) => values.find(v => event && isSameDay(v.date || event.startDate, c.date || event.startDate) && v.class === c.class)
    const wasSelected = (c: EventClass) => c.judge?.id === id
    const previousOrUndefined = (c: EventClass) => wasSelected(c) ? undefined : c.judge
    return event.classes.map(c => ({
      ...c,
      judge: isSelected(c) ? judge : previousOrUndefined(c),
    }))
  }

  return (
    <CollapsibleSection title={t('judges')} open={open} onOpenChange={onOpenChange} error={error} helperText={helperText}>
      <Grid item container spacing={1}>
        {list.map((id, index) => {
          const title = index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`
          const value = judges.find(j => j.id === id)
          return (
            <Grid key={id} item container spacing={1} alignItems="center">
              <Grid item sx={{ width: 300 }}>
                <AutocompleteSingle
                  value={value}
                  label={title}
                  error={!value}
                  helperText={!value ? `Tuomari ${id} ei ole käytettävissä` : ''}
                  getOptionLabel={o => o?.name || ''}
                  options={filterJudges(judges, event.judges, id, event.eventType)}
                  onChange={(_e, value) => {
                    const newId = value?.id
                    const newJudges = [...event.judges]
                    const oldId = newJudges.splice(index, 1)[0]
                    if (newId) {
                      newJudges.splice(index, 0, newId)
                    }
                    onChange({
                      judges: newJudges,
                      classes: updateJudge(newId, event.classes.filter(c => c.judge && c.judge.id === oldId)),
                    })
                  }}
                />
              </Grid>
              <Grid item sx={{ width: 300 }}>
                <EventClasses
                  id={`class${index}`}
                  event={event}
                  value={event.classes.filter(c => c.judge && c.judge.id === id)}
                  classes={[...event.classes]}
                  label="Arvostelee koeluokat"
                  onChange={(_e, values) => onChange({
                    classes: updateJudge(id, values),
                  })}
                />
              </Grid>
              <Grid item>
                <Button startIcon={<DeleteOutline />} onClick={() => onChange({judges: event.judges.filter(j => j !== id), classes: event.classes.map(c => c.judge?.id === id ? {...c, judge: undefined} : c)})}>Poista tuomari</Button>
              </Grid>
            </Grid>
          )
        })}
        <Grid item><Button startIcon={<AddOutlined />} onClick={() => onChange({ judges: [...event.judges].concat(0) })}>Lisää tuomari</Button></Grid>
      </Grid>
    </CollapsibleSection>
  )
}
