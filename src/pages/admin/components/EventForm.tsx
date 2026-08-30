import type { Theme } from '@mui/material'
import type { DogEvent, EventState, Patch } from '../../../types'
import type { PartialEvent } from './eventForm/types'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { atom, useAtomValue } from 'jotai'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { objectsDiffer } from '../../../lib/diff'
import { isEventOver, OFFICIAL_EVENT_TYPES } from '../../../lib/event'
import { merge } from '../../../lib/utils'
import { AsyncButton } from '../../components/AsyncButton'
import AutocompleteSingle from '../../components/AutocompleteSingle'
import {
  adminActiveEventTypesAtom,
  adminActiveJudgesAtom,
  adminEventTypeClassesAtom,
  adminLocationNamesAtom,
  adminUserOrganizersAtom,
  adminUsersAtom,
} from '../state'
import AdditionalInfoSection from './eventForm/AdditionalInfoSection'
import BasicInfoSection from './eventForm/BasicInfoSection'
import ContactInfoSection from './eventForm/ContactInfoSection'
import EntrySection from './eventForm/EntrySection'
import HeadquartersSection from './eventForm/HeadquartersSection'
import JudgesSection from './eventForm/JudgesSection'
import KcIdSection from './eventForm/KcIdSection'
import PaymentSection from './eventForm/PaymentSection'
import { requiredFields, validateEvent } from './eventForm/validation'

interface Props {
  readonly event: DogEvent
  readonly changes?: Patch<DogEvent>
  readonly canSave?: boolean
  readonly disabled?: boolean
  readonly onSave?: () => Promise<void>
  readonly onCancel?: () => void
  readonly onChange?: (event: Patch<DogEvent>) => void
}

const SELECTABLE_EVENT_STATES: EventState[] = ['draft', 'tentative', 'confirmed', 'cancelled']
const eventFormOptionsAtom = atom(async (get) =>
  Promise.all([
    get(adminActiveEventTypesAtom),
    get(adminActiveJudgesAtom),
    Promise.resolve(get(adminEventTypeClassesAtom)),
    get(adminUsersAtom),
    get(adminUserOrganizersAtom),
    get(adminLocationNamesAtom),
  ] as const)
)

export default function EventForm({ event, changes, canSave, disabled, onSave, onCancel, onChange }: Props) {
  const { t } = useTranslation()
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [activeEventTypes, activeJudges, eventTypeClasses, users, organizers, locations] =
    useAtomValue(eventFormOptionsAtom)
  const [errors, setErrors] = useState(event ? validateEvent(event) : [])
  const [open, setOpen] = useState<{ [key: string]: boolean | undefined }>({
    basic: true,
    contact: md,
    entry: md,
    hq: md,
    info: md,
    judges: md,
    kcId: md,
    payment: md,
  })
  const valid = errors.length === 0
  const allDisabled = disabled || (isEventOver(event) && !!event.id && event.state !== 'draft')
  const stateDisabled = allDisabled || !SELECTABLE_EVENT_STATES.includes(event.state ?? 'draft')
  // requiredFields only depends on event.state/eventType, so it rarely actually changes even
  // though `event` gets a new reference on every edit. Keep the previous reference when the
  // computed value is unchanged so memoized sections below don't re-render needlessly.
  const fieldsRef = useRef<ReturnType<typeof requiredFields>>(undefined)
  const nextFields = useMemo(() => requiredFields(event), [event])
  if (!fieldsRef.current || objectsDiffer(fieldsRef.current, nextFields)) {
    fieldsRef.current = nextFields
  }
  const fields = fieldsRef.current
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

  // Narrow slices of `event` for the sections below, memoized by the specific fields each
  // section actually reads. `event`'s sub-fields keep their previous reference when untouched
  // (see lib/utils#merge), so these only produce a new object when a relevant field changes —
  // letting the memoized sections skip re-rendering on unrelated edits.
  const basicInfoEvent = useMemo(
    () => ({
      classes: event.classes,
      contactInfo: event.contactInfo,
      dates: event.dates,
      endDate: event.endDate,
      entries: event.entries,
      entryEndDate: event.entryEndDate,
      entryStartDate: event.entryStartDate,
      eventType: event.eventType,
      judges: event.judges,
      kcEvent: event.kcEvent,
      kcId: event.kcId,
      location: event.location,
      name: event.name,
      official: event.official,
      organizer: event.organizer,
      placesPerDay: event.placesPerDay,
      secretary: event.secretary,
      startDate: event.startDate,
    }),
    [
      event.classes,
      event.contactInfo,
      event.dates,
      event.endDate,
      event.entries,
      event.entryEndDate,
      event.entryStartDate,
      event.eventType,
      event.judges,
      event.kcEvent,
      event.kcId,
      event.location,
      event.name,
      event.official,
      event.organizer,
      event.placesPerDay,
      event.secretary,
      event.startDate,
    ]
  )
  const judgesEvent = useMemo(
    () => ({
      classes: event.classes,
      endDate: event.endDate,
      eventType: event.eventType,
      judges: event.judges,
      startDate: event.startDate,
    }),
    [event.classes, event.endDate, event.eventType, event.judges, event.startDate]
  )
  const entryEvent = useMemo(
    () => ({
      classes: event.classes,
      createdAt: event.createdAt,
      dates: event.dates,
      endDate: event.endDate,
      entryEndDate: event.entryEndDate,
      entryStartDate: event.entryStartDate,
      eventType: event.eventType,
      places: event.places,
      placesPerDay: event.placesPerDay,
      priority: event.priority,
      startDate: event.startDate,
    }),
    [
      event.classes,
      event.createdAt,
      event.dates,
      event.endDate,
      event.entryEndDate,
      event.entryStartDate,
      event.eventType,
      event.places,
      event.placesPerDay,
      event.priority,
      event.startDate,
    ]
  )
  const paymentEvent = useMemo(
    () => ({
      cost: event.cost,
      costMember: event.costMember,
      entryStartDate: event.entryStartDate,
      paymentTime: event.paymentTime,
    }),
    [event.cost, event.costMember, event.entryStartDate, event.paymentTime]
  )
  const entryDatesChanged = useMemo(
    () => !!changes && ('entryStartDate' in changes || 'entryEndDate' in changes),
    [changes]
  )

  // handleChange is passed as `onChange` to every memoized section below, so it must stay
  // referentially stable across keystrokes. Reading `event` through a ref (instead of a
  // dependency) keeps the callback identity stable even though `event` itself changes on
  // every edit.
  const eventRef = useRef(event)
  eventRef.current = event

  const handleChange = useCallback(
    (props: Patch<DogEvent>) => {
      const event = eventRef.current
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
      // Keep season in sync with startDate year
      if (props.startDate) {
        newState.season = String(newState.startDate.getFullYear())
      }

      // Keep the previous errors reference when nothing actually changed, so the errorStates/
      // helperTexts memo below (and any memoized section relying on them) can skip recomputing.
      setErrors((prev) => {
        const next = validateEvent(newState)
        return objectsDiffer(prev, next) ? next : prev
      })
      onChange?.(newState)
    },
    [onChange]
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
            contact: false,
            entry: false,
            hq: false,
            info: false,
            judges: false,
            kcId: false,
            payment: false,
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
  const handleKcIdOpenChange = useCallback((value: boolean) => handleOpenChange('kcId', value), [handleOpenChange])
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
        maxHeight: '100%',
        maxWidth: '100%',
        overflow: 'auto',
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
          '& .MuiInputBase-root': { bgcolor: 'background.default' },
          bgcolor: 'background.form',
          overflow: 'auto',
          pb: 0.5,
        }}
      >
        <BasicInfoSection
          disabled={allDisabled}
          errorStates={errorStates}
          event={basicInfoEvent}
          eventTypeClasses={eventTypeClasses}
          eventTypes={activeEventTypes.map((et) => et.eventType)}
          fields={fields}
          helperTexts={helperTexts}
          locations={locations}
          officials={officials}
          onChange={handleChange}
          onOpenChange={handleBasicOpenChange}
          open={open.basic}
          organizers={organizers}
          secretaries={secretaries}
          selectedEventType={selectedEventType}
        />
        {OFFICIAL_EVENT_TYPES.includes(event.eventType ?? '') && (
          <KcIdSection
            disabled={allDisabled}
            errorStates={errorStates}
            event={basicInfoEvent}
            fields={fields}
            onChange={handleChange}
            onOpenChange={handleKcIdOpenChange}
            open={open.kcId}
          />
        )}
        <JudgesSection
          disabled={allDisabled}
          errorStates={errorStates}
          event={judgesEvent}
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
          entryDatesChanged={entryDatesChanged}
          errorStates={errorStates}
          errors={errors}
          event={entryEvent}
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
          event={paymentEvent}
          errors={errors}
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
          description={event.description}
          onChange={handleChange}
          onOpenChange={handleInfoOpenChange}
          open={open.info}
        />
      </Box>

      <Stack
        spacing={1}
        direction="row"
        justifyContent="flex-end"
        sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', p: 1 }}
      >
        <AsyncButton
          color="primary"
          disabled={!canSave || !valid || allDisabled}
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
