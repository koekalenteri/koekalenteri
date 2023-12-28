import type { DeepPartial, EventClass, EventType, Judge, PublicJudge } from '../../../../types'
import type { SectionProps } from '../EventForm'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { isSameDay } from 'date-fns'

import { countries } from '../../../../lib/countries'
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

type PartialPublicJudge = Partial<PublicJudge>
type PartialPublicJudgeValue = PartialPublicJudge | PartialPublicJudge[]

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
  const officialJudges = event.judges.filter((j) => j.official)
  const unofficialJudges = event.judges.filter((j) => !j.official)
  const validationError = useMemo(
    () => event && fields?.required.judges && validateEventField(event, 'judges', true),
    [event, fields?.required.judges]
  )
  const error = useMemo(
    () => !!validationError || officialJudges.some((ej) => ej.id && !judges.find((j) => j.id === ej.id)),
    [judges, officialJudges, validationError]
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

  const toArray = (j?: PartialPublicJudge): PartialPublicJudge[] => (j ? [j] : [])
  const makeArray = (j?: PartialPublicJudgeValue) => (Array.isArray(j) ? [...j] : toArray(j))
  const selectJudge = (j?: PartialPublicJudgeValue, judge?: PublicJudge): PartialPublicJudge[] => {
    const a = makeArray(j)
    if (judge && !a.find((cj) => cj.id === judge.id)) {
      a.push(judge)
    }
    return a
  }
  const removeJudge = (j?: PartialPublicJudgeValue, id?: number): PartialPublicJudge[] => {
    const a = makeArray(j)
    return a.filter((cj) => cj.id !== id)
  }
  const updateJudge = (id: number | undefined, judge: PublicJudge | undefined, values?: DeepPartial<EventClass>[]) => {
    const isSelected = (c: DeepPartial<EventClass>) =>
      values?.find(
        (v) => event && isSameDay(v.date ?? event.startDate, c.date ?? event.startDate) && v.class === c.class
      )
    return event.classes?.map((c) => ({
      ...c,
      judge: isSelected(c) ? selectJudge(c.judge, judge) : removeJudge(c.judge, id),
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
        {officialJudges.map((judge, index) => {
          const title = index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`
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
                      classes: updateJudge(newJudge?.id, newJudge, filterClassesByJudgeId(event.classes, oldJudge.id)),
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
                      classes: updateJudge(judge.id, judge, [...values]),
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
        })}
        {unofficialJudges.length > 0 ? (
          <Typography variant="subtitle1" sx={{ pt: 1 }}>
            Epäviralliset ja ulkomaiset tuomarit
          </Typography>
        ) : null}
        {unofficialJudges.map((judge, unfficialIndex) => {
          const index = officialJudges.length + unfficialIndex
          const title = index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`
          return (
            <Grid key={'unofficial-' + index} item container spacing={1} alignItems="center">
              <Grid item sx={{ width: 300 }}>
                <TextField
                  fullWidth
                  label={title}
                  value={judge.name}
                  onChange={(e) => {
                    const newJudges = [...event.judges]
                    newJudges[index] = { ...newJudges[index], name: e.target.value }
                    onChange?.({ judges: newJudges })
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
                      classes: updateJudge(judge.id, judge, [...values]),
                    })
                  }
                />
              </Grid>
              <Grid item sx={{ width: 200 }}>
                <AutocompleteSingle
                  options={countries}
                  getOptionLabel={(option) => t(option, { ns: 'country' })}
                  renderOption={(props, option) => (
                    <Box component="li" sx={{ '& > img': { mr: 2, flexShrink: 0 } }} {...props}>
                      <img
                        loading="lazy"
                        width="20"
                        srcSet={`https://flagcdn.com/w40/${option.toLowerCase()}.png 2x`}
                        src={`https://flagcdn.com/w20/${option.toLowerCase()}.png`}
                        alt=""
                      />
                      {t(option, { ns: 'country' })}
                    </Box>
                  )}
                  value={judge.foreing ? judge.country : 'FI'}
                  label={'Maa'}
                  disabled={!judge.foreing}
                  onChange={(country) => {
                    const newJudges = [...event.judges]
                    newJudges[index] = { ...newJudges[index], country: country ?? undefined }
                    onChange?.({ judges: newJudges })
                  }}
                />
              </Grid>
              <Grid item>
                <Button
                  startIcon={<DeleteOutline />}
                  disabled={disabled}
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
        })}
        <Grid item>
          <Button
            disabled={disabled}
            startIcon={<AddOutlined />}
            onClick={() => {
              const newJudges = [...event.judges].concat({ id: 0, name: '', official: true })
              newJudges.sort((a, b) => Number(b.official) - Number(a.official))
              onChange?.({
                judges: newJudges,
              })
            }}
          >
            Lisää tuomari
          </Button>
          <Button
            disabled={disabled}
            startIcon={<AddOutlined />}
            onClick={() => {
              const newJudges = [...event.judges].concat({
                id: (unofficialJudges.length + 1) * -1,
                name: '',
                official: false,
                foreing: true,
              })
              newJudges.sort((a, b) => Number(b.official) - Number(a.official))
              onChange?.({
                judges: newJudges,
              })
            }}
          >
            Lisää ulkomainen tuomari
          </Button>
          <Button
            disabled={disabled || selectedEventType?.official}
            startIcon={<AddOutlined />}
            onClick={() =>
              onChange?.({
                judges: [...event.judges].concat({ id: (unofficialJudges.length + 1) * -1, name: '', official: false }),
              })
            }
          >
            Lisää epävirallinen tuomari
          </Button>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
