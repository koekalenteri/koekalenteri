import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cancel, Save } from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import { Box, Button, Paper, Stack, Theme, useMediaQuery } from '@mui/material'
import type { DeepPartial, Event, EventClass, EventState, Judge, Official, Organizer } from 'koekalenteri-shared/model'

import { merge } from '../../../utils'
import AutocompleteSingle from '../../components/AutocompleteSingle'

import AdditionalInfoSection from './eventForm/AdditionalInfoSection'
import BasicInfoSection from './eventForm/BasicInfoSection'
import ContactInfoSection from './eventForm/ContactInfoSection'
import EntrySection from './eventForm/EntrySection'
import HeadquartersSection from './eventForm/HeadquartersSection'
import JudgesSection from './eventForm/JudgesSection'
import PaymentSection from './eventForm/PaymentSection'
import { FieldRequirements, requiredFields, validateEvent } from './eventForm/validation'

export interface PartialEvent extends DeepPartial<Event> {
  startDate: Date
  endDate: Date
  classes: EventClass[]
  judges: number[]
}

export interface SectionProps {
  event: PartialEvent
  fields?: FieldRequirements
  errorStates?: { [Property in keyof Event]?: boolean }
  helperTexts?: { [Property in keyof Event]?: string }
  open?: boolean
  onChange?: (event: DeepPartial<Event>) => void
  onOpenChange?: (value: boolean) => void
}

interface Props {
  event: Event
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  judges: Judge[]
  officials: Official[]
  organizers: Organizer[]
  changes?: boolean
  onSave?: () => void
  onCancel?: () => void
  onChange?: (event: Event) => void
}

export default function EventForm({
  event,
  judges,
  eventTypes,
  eventTypeClasses,
  officials,
  organizers,
  changes,
  onSave,
  onCancel,
  onChange,
}: Props) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const { t } = useTranslation()
  const [errors, setErrors] = useState(event ? validateEvent(event) : [])
  const [open, setOpen] = useState<{ [key: string]: boolean | undefined }>({
    basic: true,
    judges: md,
    entry: md,
    payment: md,
    hq: md,
    contact: md,
    info: md,
  })
  const valid = errors.length === 0
  const fields = useMemo(() => requiredFields(event), [event])

  const handleChange = useCallback(
    (props: DeepPartial<Event>) => {
      if (!event) {
        return
      }
      const newState = merge<Event>(event, props)
      setErrors(validateEvent(newState))
      onChange?.(newState)
    },
    [event, onChange]
  )

  const handleOpenChange = useCallback(
    (id: keyof typeof open, value: boolean) => {
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
    },
    [md, open]
  )
  const getStateLabel = useCallback((o: EventState) => t(`event.states.${o}`), [t])
  const handleStateChange = useCallback(
    (value: NonNullable<EventState>) => handleChange({ state: value || undefined }),
    [handleChange]
  )
  const handleBasicOpenChange = useCallback((value: boolean) => handleOpenChange('basic', value), [handleOpenChange])
  const handleJudgesOpenChange = useCallback((value: boolean) => handleOpenChange('judges', value), [handleOpenChange])
  const handleEntryOpenChange = useCallback((value: boolean) => handleOpenChange('entry', value), [handleOpenChange])
  const handlePaymentOpenChange = useCallback(
    (value: boolean) => handleOpenChange('payment', value),
    [handleOpenChange]
  )
  const handleHQOpenChange = useCallback((value: boolean) => handleOpenChange('hq', value), [handleOpenChange])
  const handleContactOpenChange = useCallback(
    (value: boolean) => handleOpenChange('contact', value),
    [handleOpenChange]
  )
  const handleInfoOpenChange = useCallback((value: boolean) => handleOpenChange('info', value), [handleOpenChange])

  const errorStates: { [Property in keyof PartialEvent]?: boolean } = {}
  const helperTexts: { [Property in keyof PartialEvent]?: string } = {}
  for (const error of errors) {
    helperTexts[error.opts.field] = t(`validation.event.${error.key}`, error.opts)
    errorStates[error.opts.field] = true
  }

  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        overflow: 'auto',
        maxHeight: '100%',
        maxWidth: '100%',
      }}
    >
      <Box sx={{ p: 1 }}>
        <AutocompleteSingle
          disableClearable
          getOptionLabel={getStateLabel}
          label={t('event.state')}
          onChange={handleStateChange}
          options={['draft', 'tentative', 'confirmed', 'cancelled'] as EventState[]}
          sx={{ width: 200 }}
          value={event?.state}
        />
      </Box>

      <Box
        sx={{
          pb: 0.5,
          overflow: 'auto',
          bgcolor: 'background.form',
          '& .MuiInputBase-root': { bgcolor: 'background.default' },
        }}
      >
        <BasicInfoSection
          errorStates={errorStates}
          event={event}
          eventTypeClasses={eventTypeClasses}
          eventTypes={eventTypes}
          fields={fields}
          helperTexts={helperTexts}
          officials={officials}
          onChange={handleChange}
          onOpenChange={handleBasicOpenChange}
          open={open.basic}
          organizers={organizers}
        />
        <JudgesSection
          errorStates={errorStates}
          event={event}
          fields={fields}
          helperTexts={helperTexts}
          judges={judges}
          onChange={handleChange}
          onOpenChange={handleJudgesOpenChange}
          open={open.judges}
        />
        <EntrySection
          errorStates={errorStates}
          event={event}
          fields={fields}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={handleEntryOpenChange}
          open={open.entry}
        />
        <PaymentSection
          errorStates={errorStates}
          event={event}
          fields={fields}
          onChange={handleChange}
          onOpenChange={handlePaymentOpenChange}
          open={open.payment}
        />
        <HeadquartersSection
          errorStates={errorStates}
          headquarters={event.headquarters}
          fields={fields}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={handleHQOpenChange}
          open={open.hq}
        />
        <ContactInfoSection
          error={errorStates.contactInfo}
          contactInfo={event.contactInfo}
          official={event.official}
          secretary={event.secretary}
          helperText={helperTexts.contactInfo}
          onChange={handleChange}
          onOpenChange={handleContactOpenChange}
          open={open.contact}
        />
        <AdditionalInfoSection
          errorStates={errorStates}
          event={event}
          fields={fields}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={handleInfoOpenChange}
          open={open.info}
        />
      </Box>

      <Stack
        spacing={1}
        direction="row"
        justifyContent="flex-end"
        sx={{ p: 1, borderTop: '1px solid', borderColor: '#bdbdbd' }}
      >
        <LoadingButton
          color="primary"
          disabled={!changes || !valid}
          loadingPosition="start"
          startIcon={<Save />}
          variant="contained"
          onClick={onSave}
        >
          Tallenna
        </LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={onCancel}>
          Peruuta
        </Button>
      </Stack>
    </Paper>
  )
}
