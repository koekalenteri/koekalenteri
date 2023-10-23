import type { Theme } from '@mui/material'
import type { DeepPartial, Event, EventClass, EventState } from '../../../types'
import type { FieldRequirements } from './eventForm/validation'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import LoadingButton from '@mui/lab/LoadingButton'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { useRecoilValue } from 'recoil'

import { isEventOver, merge } from '../../../utils'
import AutocompleteSingle from '../../components/AutocompleteSingle'
import { activeEventTypesSelector, activeJudgesSelector, eventTypeClassesAtom } from '../../recoil'
import { adminUserOrganizersSelector, adminUsersAtom, officialsAtom } from '../recoil'

import AdditionalInfoSection from './eventForm/AdditionalInfoSection'
import BasicInfoSection from './eventForm/BasicInfoSection'
import ContactInfoSection from './eventForm/ContactInfoSection'
import EntrySection from './eventForm/EntrySection'
import HeadquartersSection from './eventForm/HeadquartersSection'
import JudgesSection from './eventForm/JudgesSection'
import PaymentSection from './eventForm/PaymentSection'
import { requiredFields, validateEvent } from './eventForm/validation'

export interface PartialEvent extends DeepPartial<Event> {
  startDate: Date
  endDate: Date
  classes: EventClass[]
  judges: number[]
}

export interface SectionProps {
  readonly event: PartialEvent
  readonly disabled?: boolean
  readonly fields?: FieldRequirements
  readonly errorStates?: { [Property in keyof Event]?: boolean }
  readonly helperTexts?: { [Property in keyof Event]?: string }
  readonly open?: boolean
  readonly onChange?: (event: DeepPartial<Event>) => void
  readonly onOpenChange?: (value: boolean) => void
}

interface Props {
  readonly event: Event
  readonly changes?: boolean
  readonly disabled?: boolean
  readonly onSave?: () => void
  readonly onCancel?: () => void
  readonly onChange?: (event: Event) => void
}

const SELECTABLE_EVENT_STATES: EventState[] = ['draft', 'tentative', 'confirmed', 'cancelled']

export default function EventForm({ event, changes, disabled, onSave, onCancel, onChange }: Props) {
  const { t } = useTranslation()
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const activeEventTypes = useRecoilValue(activeEventTypesSelector)
  const activeJudges = useRecoilValue(activeJudgesSelector)
  const eventTypeClasses = useRecoilValue(eventTypeClassesAtom)
  const officials = useRecoilValue(officialsAtom)
  const users = useRecoilValue(adminUsersAtom)
  const organizers = useRecoilValue(adminUserOrganizersSelector)
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
  const allDisabled = disabled || isEventOver(event)
  const stateDisabled = allDisabled || !SELECTABLE_EVENT_STATES.includes(event.state)
  const fields = useMemo(() => requiredFields(event), [event])
  const orgSecretries = event.organizer?.id ? users.filter((u) => u.roles?.[event.organizer.id]) : []
  const secretaries = orgSecretries.concat(officials.map((o) => ({ ...o, id: o.id.toString() })))

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

  const { errorStates, helperTexts } = useMemo(() => {
    const errorStates: { [Property in keyof PartialEvent]?: boolean } = {}
    const helperTexts: { [Property in keyof PartialEvent]?: string } = {}
    for (const error of errors) {
      helperTexts[error.opts.field] = t(`validation.event.${error.key}`, error.opts)
      errorStates[error.opts.field] = true
    }
    return { errorStates, helperTexts }
  }, [errors, t])

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
          disabled={stateDisabled}
          disableClearable
          getOptionLabel={getStateLabel}
          label={t('event.state')}
          onChange={handleStateChange}
          options={SELECTABLE_EVENT_STATES}
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
          disabled={allDisabled}
          errorStates={errorStates}
          event={event}
          eventTypeClasses={eventTypeClasses}
          eventTypes={activeEventTypes.map((et) => et.eventType)}
          fields={fields}
          helperTexts={helperTexts}
          officials={officials}
          onChange={handleChange}
          onOpenChange={handleBasicOpenChange}
          open={open.basic}
          organizers={organizers}
          secretaries={secretaries}
        />
        <JudgesSection
          disabled={allDisabled}
          errorStates={errorStates}
          event={event}
          fields={fields}
          helperTexts={helperTexts}
          judges={activeJudges}
          onChange={handleChange}
          onOpenChange={handleJudgesOpenChange}
          open={open.judges}
        />
        <EntrySection
          disabled={allDisabled}
          errorStates={errorStates}
          event={event}
          fields={fields}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={handleEntryOpenChange}
          open={open.entry}
        />
        <PaymentSection
          disabled={allDisabled}
          errorStates={errorStates}
          event={event}
          fields={fields}
          onChange={handleChange}
          onOpenChange={handlePaymentOpenChange}
          open={open.payment}
        />
        <HeadquartersSection
          disabled={allDisabled}
          errorStates={errorStates}
          headquarters={event.headquarters}
          fields={fields}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={handleHQOpenChange}
          open={open.hq}
        />
        <ContactInfoSection
          disabled={allDisabled}
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
          disabled={allDisabled}
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
          disabled={!changes || !valid || allDisabled}
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