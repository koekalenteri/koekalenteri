import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cancel, Save } from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import { Box, Button, Paper, Stack, Theme, useMediaQuery } from '@mui/material'
import type { DeepPartial, Event, EventClass, EventState, Judge, Official, Organizer } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { AutocompleteSingle } from '../../../components'
import { DecoratedEvent, editAdminEventModifiedAtom, editAdminEventSelector } from '../recoil'

import AdditionalInfoSection from './eventForm/AdditionalInfoSection'
import BasicInfoSection from './eventForm/BasicInfoSection'
import ContactInfoSection from './eventForm/ContactInfoSection'
import EntrySection from './eventForm/EntrySection'
import HeadquartersSection from './eventForm/HeadquartersSection'
import JudgesSection from './eventForm/JudgesSection'
import PaymentSection from './eventForm/PaymentSection'
import { FieldRequirements, requiredFields, validateEvent } from './eventForm/validation'

export type PartialEvent = DeepPartial<Event> & { startDate: Date, endDate: Date, classes: EventClass[], judges: number[] }

export interface SectionProps {
  event: PartialEvent
  fields?: FieldRequirements
  errorStates?: { [Property in keyof Event]?: boolean }
  helperTexts?: { [Property in keyof Event]?: string }
  open?: boolean
  onChange: (event: DeepPartial<Event>) => void
  onOpenChange?: (value: boolean) => void
}

type EventFormParams = {
  eventId?: string
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  judges: Judge[]
  officials: Official[]
  organizers: Organizer[]
  onSave: (event: Partial<Event>) => void
  onCancel: () => void
}

export default function EventForm({ eventId, judges, eventTypes, eventTypeClasses, officials, organizers, onSave, onCancel }: EventFormParams) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const { t } = useTranslation()
  const [event, setEvent] = useRecoilState(editAdminEventSelector(eventId))
  const [saving, setSaving] = useState(false)
  const [changes, setChanges] = useRecoilState(editAdminEventModifiedAtom(eventId))
  const [errors, setErrors] = useState(event ? validateEvent(event as PartialEvent) : [])
  const [open, setOpen] = useState<{[key: string]: boolean|undefined}>({
    basic: true,
    judges: md,
    entry: md,
    payment: md,
    hq: md,
    contact: md,
    info: md,
  })
  const valid = errors.length === 0
  const fields = useMemo(() => requiredFields(event as PartialEvent), [event])

  const onChange = useCallback((props: DeepPartial<Event>) => {
    if (!event) {
      return
    }
    const tmp: any = {}
    const keys = Object.keys(props) as Array<keyof Event>
    keys.forEach(k => {tmp[k] = event[k]})
    console.log('changed: ' + JSON.stringify(props), JSON.stringify(tmp))
    if (props.eventType && (eventTypeClasses[props.eventType] || []).length === 0) {
      props.classes = []
    }
    const newState = { ...event, ...props } as PartialEvent
    setErrors(validateEvent(newState))
    setEvent(newState as DecoratedEvent) // TODO: without typecast
    setChanges(true)
  }, [event, eventTypeClasses, setEvent, setChanges])

  const saveHandler = async () => {
    if (!event) {
      return
    }
    setSaving(true)
    onSave(event)
    setSaving(false)
  }
  const cancelHandler = () => {
    if (event) {
      setEvent(undefined)
    }
    onCancel()
  }

  const handleOpenChange = (id: keyof typeof open, value: boolean) => {
    const newState = md
      ? {
        ...open,
        [id]: value,
      }
      : {
        basic: false,
        judges: false,
        entry: false,
        payment: false,
        hq: false,
        contact: false,
        info: false,
        [id]: value,
      }
    setOpen(newState)
  }

  const errorStates: { [Property in keyof PartialEvent]?: boolean } = {}
  const helperTexts: { [Property in keyof PartialEvent]?: string } = {}
  for (const error of errors) {
    helperTexts[error.opts.field] = t(`validation.event.${error.key}`, error.opts)
    errorStates[error.opts.field] = true
  }

  if (!event) {
    return null
  }

  return (
    <Paper elevation={2} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto', maxHeight: '100%', maxWidth: '100%' }}>
      <Box sx={{ p: 1 }}>
        <AutocompleteSingle
          disableClearable
          getOptionLabel={o => t(`event.states.${o}`)}
          label={t('event.state')}
          onChange={(e, value) => onChange({state: value || undefined})}
          options={['draft', 'tentative', 'confirmed', 'cancelled'] as EventState[]}
          sx={{width: 200}}
          value={event?.state}
        />
      </Box>

      <Box sx={{ pb: 0.5, overflow: 'auto', bgcolor: 'background.form', '& .MuiInputBase-root': { bgcolor: 'background.default'} }}>
        <BasicInfoSection
          errorStates={errorStates}
          event={event as PartialEvent}
          eventTypeClasses={eventTypeClasses}
          eventTypes={eventTypes}
          fields={fields}
          helperTexts={helperTexts}
          officials={officials}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('basic', value)}
          open={open.basic}
          organizers={organizers}
        />
        <JudgesSection
          errorStates={errorStates}
          event={event as PartialEvent}
          fields={fields}
          helperTexts={helperTexts}
          judges={judges}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('judges', value)}
          open={open.judges}
        />
        <EntrySection
          errorStates={errorStates}
          event={event as PartialEvent}
          fields={fields}
          helperTexts={helperTexts}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('entry', value)}
          open={open.entry}
        />
        <PaymentSection
          errorStates={errorStates}
          event={event as PartialEvent}
          fields={fields}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('payment', value)}
          open={open.payment}
        />
        <HeadquartersSection
          errorStates={errorStates}
          headquarters={event.headquarters}
          fields={fields}
          helperTexts={helperTexts}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('hq', value)}
          open={open.hq}
        />
        <ContactInfoSection
          error={errorStates.contactInfo}
          contactInfo={event.contactInfo}
          official={event.official}
          secretary={event.secretary}
          helperText={helperTexts.contactInfo}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('contact', value)}
          open={open.contact}
        />
        <AdditionalInfoSection
          errorStates={errorStates}
          event={event as PartialEvent}
          fields={fields}
          helperTexts={helperTexts}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('info', value)}
          open={open.info}
        />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{p: 1, borderTop: '1px solid', borderColor: '#bdbdbd'}}>
        <LoadingButton color="primary" disabled={!changes || !valid} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </Paper>
  )
}
