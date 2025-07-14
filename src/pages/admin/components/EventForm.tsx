import type { Theme } from '@mui/material'
import type { DeepPartial, DogEvent, EventState } from '../../../types'
import type { PartialEvent } from './eventForm/types'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { useRecoilValue, waitForAll } from 'recoil'

import { isEventOver, merge } from '../../../lib/utils'
import { AsyncButton } from '../../components/AsyncButton'
import AutocompleteSingle from '../../components/AutocompleteSingle'
import {
  adminActiveEventTypesSelector,
  adminActiveJudgesSelector,
  adminEventTypeClassesAtom,
  adminUserOrganizersSelector,
  adminUsersAtom,
} from '../recoil'

import AdditionalInfoSection from './eventForm/AdditionalInfoSection'
import BasicInfoSection from './eventForm/BasicInfoSection'
import ContactInfoSection from './eventForm/ContactInfoSection'
import EntrySection from './eventForm/EntrySection'
import HeadquartersSection from './eventForm/HeadquartersSection'
import JudgesSection from './eventForm/JudgesSection'
import PaymentSection from './eventForm/PaymentSection'
import { requiredFields, validateEvent } from './eventForm/validation'

interface Props {
  readonly event: DogEvent
  readonly changes?: boolean
  readonly disabled?: boolean
  readonly onSave?: () => Promise<void>
  readonly onCancel?: () => void
  readonly onChange?: (event: DogEvent) => void
}

const SELECTABLE_EVENT_STATES: EventState[] = ['draft', 'tentative', 'confirmed', 'cancelled']

export default function EventForm({ event, changes, disabled, onSave, onCancel, onChange }: Props) {
  const { t } = useTranslation()
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [activeEventTypes, activeJudges, eventTypeClasses, users, organizers] = useRecoilValue(
    waitForAll([
      adminActiveEventTypesSelector,
      adminActiveJudgesSelector,
      adminEventTypeClassesAtom,
      adminUsersAtom,
      adminUserOrganizersSelector,
    ])
  )
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
  const stateDisabled = allDisabled || !SELECTABLE_EVENT_STATES.includes(event.state ?? 'draft')
  const fields = useMemo(() => requiredFields(event), [event])
  const officials = useMemo(() => users.filter((u) => u.officer), [users])
  const secretaries = useMemo(
    () =>
      event.organizer?.id ? users.filter((u) => !!u.officer || !!u.roles?.[event.organizer?.id ?? '']) : officials,
    [event.organizer?.id, officials, users]
  )
  const selectedEventType = useMemo(
    () => activeEventTypes?.find((et) => et.eventType === event.eventType),
    [activeEventTypes, event.eventType]
  )
  const selectedEventTypeClasses = useMemo(
    () => eventTypeClasses?.[event.eventType],
    [event.eventType, eventTypeClasses]
  )

  const handleChange = useCallback(
    (props: DeepPartial<DogEvent>) => {
      if (!event) {
        return
      }
      const newState = merge<DogEvent>(event, props)

      // Owerwriting props that should not be merged
      if (props.placesPerDay) {
        // Need to typecast because of DeepPartial usage
        newState.placesPerDay = props.placesPerDay as Record<string, number>
      }
      if (props.cost) {
        newState.cost = props.cost as DogEvent['cost']
      }
      if (props.costMember) {
        newState.costMember = props.costMember as DogEvent['costMember']
      }

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
  const getStateLabel = useCallback((o: EventState): string => t(`event.states.${o}`), [t])
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
          value={event?.state ?? 'draft'}
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
          selectedEventType={selectedEventType}
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
          selectedEventType={selectedEventType}
        />
        <EntrySection
          disabled={allDisabled}
          errorStates={errorStates}
          event={event}
          eventTypeClasses={selectedEventTypeClasses}
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
        <AsyncButton
          color="primary"
          disabled={!changes || !valid || allDisabled}
          startIcon={<Save />}
          variant="contained"
          onClick={onSave}
        >
          {t('save')}
        </AsyncButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </Stack>
    </Paper>
  )
}
