import type { EventType, Judge } from '../../../../types'
import type { SectionProps } from '../EventForm'

import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'

import CollapsibleSection from '../../../components/CollapsibleSection'

import { OfficialJudge } from './judgeSection/OfficialJudge'
import { UnofficialJudge } from './judgeSection/UnofficialJudge'
import { makeArray } from './judgeSection/utils'
import { validateEventField } from './validation'

interface Props extends Readonly<SectionProps> {
  readonly judges: Judge[]
  readonly selectedEventType?: EventType
}

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
  const otherJudges = event.judges.filter((j) => !j.official)
  const unofficialJudges = otherJudges.filter((j) => !j.foreing)
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

  useEffect(() => {
    if (selectedEventType?.official && unofficialJudges.length) {
      const validJudges = event.judges.filter((j) => j.official || j.foreing)
      onChange?.({
        judges: validJudges,
        classes: event.classes.map((c) => ({
          ...c,
          judge: makeArray(c.judge).filter((j) => validJudges.find((vj) => vj.id === j.id)),
        })),
      })
    }
  }, [event.classes, event.judges, onChange, selectedEventType?.official, unofficialJudges.length])

  return (
    <CollapsibleSection
      title={t('judges')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid item container spacing={1}>
        {event.judges.map((judge, index) =>
          judge.official ? (
            <OfficialJudge
              event={event}
              disabled={disabled}
              judges={judges}
              onChange={onChange}
              selectedEventType={selectedEventType}
              judge={judge}
              index={index}
            />
          ) : (
            <UnofficialJudge
              event={event}
              disabled={disabled}
              onChange={onChange}
              selectedEventType={selectedEventType}
              judge={judge}
              index={index}
            />
          )
        )}
        <Grid item>
          <Button
            disabled={disabled}
            startIcon={<AddOutlined />}
            onClick={() => {
              onChange?.({
                judges: [...event.judges].concat({ id: 0, name: '', official: true }),
              })
            }}
          >
            Lisää tuomari
          </Button>
          <Button
            disabled={disabled}
            startIcon={<AddOutlined />}
            onClick={() => {
              onChange?.({
                judges: [...event.judges].concat({
                  id: (otherJudges.length + 1) * -1,
                  name: '',
                  official: false,
                  foreing: true,
                }),
              })
            }}
          >
            Lisää ulkomainen tuomari
          </Button>
          <Button
            disabled={disabled || (selectedEventType?.official ?? true)}
            startIcon={<AddOutlined />}
            sx={{ display: selectedEventType?.official ?? true ? 'NONE' : undefined }}
            onClick={() =>
              onChange?.({
                judges: [...event.judges].concat({ id: (otherJudges.length + 1) * -1, name: '', official: false }),
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
