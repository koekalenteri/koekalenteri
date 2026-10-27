import type { Theme } from '@mui/material'
import type { ParseKeys, TFunction } from 'i18next'
import type { ParticipantLockReason, ParticipantLockSection } from '../../lib/registrationLocks'
import type {
  DayKey,
  DeepPartial,
  ManualTestResult,
  PublicConfirmedEvent,
  Registration,
  RegistrationPerson,
  TestResult,
} from '../../types'
import Cancel from '@mui/icons-material/Cancel'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { useMediaQuery } from '@mui/material'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Collapse from '@mui/material/Collapse'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { loadKnownTlds } from '../../lib/client/tlds'
import { calculateCost } from '../../lib/cost'
import { dayOf, TIME_ZONE } from '../../lib/day'
import { getDiffOperations } from '../../lib/diff'
import { minDogAgeFor } from '../../lib/dog'
import { isDevEnv } from '../../lib/env'
import { formatMoney } from '../../lib/money'
import { getFormPayment } from '../../lib/payment'
import { getPrioritySort, PRIORITY_MEMBER, priorityValuesToPriority, RESTRICTION } from '../../lib/priority'
import { filterRelevantResults } from '../../lib/qualification'
import {
  formatOwnerNames,
  getHandlingPerson,
  getPayingPerson,
  meetsRestrictions,
  resolveOwnerSelection,
  selectsSomeoneElse,
  withDefaultOwnerSelection,
} from '../../lib/registration'
import {
  getParticipantFieldLocks,
  getParticipantLockReason,
  isEntryRestrictionLocked,
  isParticipantFieldLocked,
  lockedHandlerMembership,
  NO_PARTICIPANT_FIELD_LOCKS,
  participantLockedChange,
  withLockedSectionsFrom,
} from '../../lib/registrationLocks'
import { hasChanges, merge } from '../../lib/utils'
import { getRequirements } from '../../rules'
import { languageAtom } from '../state'
import { AsyncButton } from './AsyncButton'
import { PaymentDetails } from './PaymentDetails'
import { AdditionalInfo } from './registrationForm/AdditionalInfo'
import { BreederInfo } from './registrationForm/BreederInfo'
import { DogInfo } from './registrationForm/DogInfo'
import { EntryInfo } from './registrationForm/EntryInfo'
import { HandlerInfo } from './registrationForm/HandlerInfo'
import { InternalNotesInfo } from './registrationForm/InternalNotesInfo'
import { LockedChangeNotice } from './registrationForm/LockedChangeNotice'
import MembershipInfo from './registrationForm/MembershipInfo'
import { OwnerInfo } from './registrationForm/OwnerInfo'
import { PayerInfo } from './registrationForm/PayerInfo'
import PaymentInfo from './registrationForm/PaymentInfo'
import QualifyingResultsInfo from './registrationForm/QualifyingResultsInfo'
import { TYPED_DOG_ONLY_LOCKS, typedDogChange } from './registrationForm/typedDogOnly'
import { validateRegistration, validateTypedDog } from './registrationForm/validation'

/**
 * Whether each section is open. Every section is always set, so none is left to CollapsibleSection's
 * own state, which starts open and does not follow the toggles the form records.
 */
type SectionOpenState = Record<
  'breeder' | 'dog' | 'entry' | 'handler' | 'info' | 'internalNotes' | 'owner' | 'payer' | 'qr',
  boolean
>

/**
 * The sections' open state for a screen size. The form starts from it, so a section never renders
 * open first and collapses after (KOE-1573), and returns to it when the screen size changes.
 */
function defaultSectionOpenState(large: boolean): SectionOpenState {
  return {
    breeder: large,
    dog: large,
    entry: true,
    handler: large,
    info: large,
    internalNotes: true,
    owner: large,
    payer: true,
    qr: large,
  }
}

interface Props {
  readonly admin?: boolean
  readonly changes?: boolean
  readonly classDate?: string
  readonly classDisabled?: boolean
  readonly className?: string
  readonly disabled?: boolean
  readonly event: PublicConfirmedEvent
  readonly onCancel?: () => void
  readonly onChange?: (registration: Registration) => void
  readonly onInternalNotesChange?: (notes: string) => void
  readonly onSave?: () => Promise<void>
  readonly registration: Registration
  readonly savedRegistration?: Registration | null
  /**
   * A trial that is over: only the dog's details typed by hand stay open, for the secretary to fix
   * what the results send needs (KOE-1650).
   */
  readonly typedDogOnly?: boolean
}

export default function RegistrationForm({
  admin,
  changes,
  classDate,
  classDisabled,
  className,
  disabled,
  event,
  onCancel,
  onChange,
  onInternalNotesChange,
  onSave,
  registration,
  savedRegistration,
  typedDogOnly,
}: Props) {
  const { t } = useTranslation()
  const { t: tBreed } = useTranslation(['translation', 'breed'])
  const language = useAtomValue(languageAtom)
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [validationErrors, setValidationErrors] = useState(() =>
    validateRegistration(registration, event, savedRegistration)
  )
  const [open, setOpen] = useState<SectionOpenState>(() => defaultSectionOpenState(large))
  const [rankingPeriod, setRankingPeriod] = useState<{ min?: DayKey; max?: DayKey }>({})
  const [lockedNotice, setLockedNotice] = useState<{ reason: ParticipantLockReason; section: ParticipantLockSection }>()

  // The sections closed for the participant, by the rule PutRegistration holds them by (KOE-1588),
  // read from the stored entry. The secretary has none.
  const stored = savedRegistration ?? registration
  const locks = useMemo(
    () => (admin ? NO_PARTICIPANT_FIELD_LOCKS : getParticipantFieldLocks(event, stored)),
    [admin, event, stored]
  )
  // The membership a handler named on a paid entry may claim, by the rule the lock reads (KOE-1588).
  const lockedHandlerClaim = useCallback(
    (handler: Pick<RegistrationPerson, 'email' | 'name'>) => lockedHandlerMembership(stored, handler),
    [stored]
  )
  // What the participant can no longer change does not hold back saving what they can: an error in
  // a locked section, a restriction only locked sections could meet (`isEntryRestrictionLocked`, which
  // PutRegistration reads too), or a qualification only the locked class, dog and results decide
  // (KOE-1588). The server decides those on its own.
  // After the trial the sections lock as a participant's would, all but the dog's typed details, and
  // only the chip's rule holds back saving a fix to them (KOE-1650).
  const sectionLocks = typedDogOnly ? TYPED_DOG_ONLY_LOCKS : locks
  const freeDisabled = disabled || typedDogOnly
  const errors = useMemo(
    () =>
      typedDogOnly
        ? validateTypedDog(registration)
        : validationErrors.filter((error) => !isParticipantFieldLocked(locks, error.opts.field)),
    [locks, registration, typedDogOnly, validationErrors]
  )
  const restriction = useMemo(
    () => (isEntryRestrictionLocked(event, locks) ? undefined : getRestrictionNotice(event, registration, tBreed)),
    [event, locks, registration, tBreed]
  )
  const qualifies = registration.qualifies || (locks.entry && locks.dog && locks.results)
  // The restriction gates the registrant; the secretary sees the same notice but decides for
  // themselves, so a registration made before the restriction stays theirs to edit.
  const valid = errors.length === 0 && (typedDogOnly || (qualifies && (admin || !restriction)))
  const costResult = calculateCost(event, registration)
  // The amount owed follows the row as it is edited (KOE-722), and so does whether paying waits for a place.
  const { due: paymentDue, waitsForPlace } = getFormPayment(event, registration)
  const ctaText = useMemo(() => {
    if (registration.id) return t('registration.cta.saveChanges')
    if (admin) {
      if (event.paymentTime === 'confirmation') {
        return t('registration.cta.confirmRegistration')
      }
      return t('registration.cta.confirmAndSendLink')
    }
    if (event.paymentTime === 'confirmation') return t('registration.cta.confirmRegistration')
    return t('registration.cta.confirmAndPay')
  }, [admin, registration.id, event.paymentTime, t])

  const requirements = useMemo(
    () =>
      getRequirements(
        registration?.eventType ?? '',
        registration?.class,
        registration?.dates?.length ? registration.dates[0].date : dayOf(new Date(), TIME_ZONE)
      ),
    [registration?.eventType, registration?.class, registration?.dates]
  )

  const handleChange = useCallback(
    (change: DeepPartial<Registration> | undefined = {}, replace?: boolean) => {
      if (disabled) return
      // After the trial only the dog's typed details are taken, and the qualification of the judged
      // entry stays as it was (KOE-1650).
      const props = typedDogOnly ? typedDogChange(registration.dog, change) : change

      // Process results and qualifications
      if (
        !typedDogOnly &&
        (props.class || props.results || props.dog?.results || (props.dog && !registration.qualifies))
      ) {
        const cls = props.class ?? registration.class
        const dogResults = props.dog?.results ?? registration.dog?.results ?? []
        const results = props.results ?? registration.results ?? []
        const filtered = filterRelevantResults(event, cls, dogResults as TestResult[], results as ManualTestResult[])
        props.qualifyingResults = filtered.relevant
        props.qualifies = filtered.qualifies
        setRankingPeriod({ max: filtered.maxResultDate, min: filtered.minResultDate })
      }

      // Create new state by merging or replacing
      const newState: Registration = replace
        ? ({ ...registration, ...props } as Registration)
        : merge<Registration>(registration, props ?? {})

      // Only update if there are actual changes
      if (hasChanges(registration, newState)) {
        // We need to update the parent component immediately for the local UI to reflect changes
        onChange?.(newState)

        if (isDevEnv()) {
          console.debug('changed', getDiffOperations(registration, newState))
        }
      }
    },
    [disabled, registration, event, onChange, typedDogOnly]
  )

  const handleOpenChange = useCallback(
    (id: keyof SectionOpenState, value: boolean) => {
      const newState = large
        ? {
            ...open,
            [id]: value,
          }
        : {
            breeder: false,
            dog: false,
            entry: false,
            handler: !selectsSomeoneElse(registration.ownerHandles),
            info: false,
            // The secretary's notes sit beside the entry: another section's toggle leaves them be.
            internalNotes: open.internalNotes,
            owner: false,
            payer: !selectsSomeoneElse(registration.ownerPays),
            qr: false,
            [id]: value,
          }
      setOpen(newState)
    },
    [large, open, registration.ownerHandles, registration.ownerPays]
  )

  const [helperTexts, errorStates] = useMemo(() => {
    const states: { [Property in keyof Registration]?: boolean } = {}
    const texts = getSectionHelperTexts(registration, t)
    // A breed-only restriction is the dog's to meet; an incomplete dog is reported ahead of it.
    if (restriction?.section === 'dog') {
      texts.dog = restriction.text
      states.dog = true
    }
    for (const error of errors) {
      texts[error.opts.field] = t(`validation.registration.${error.key}`, error.opts)
      states[error.opts.field] = true
    }
    if (!registration?.dog?.regNo) {
      texts.breeder = texts.owner = texts.qualifyingResults = t('validation.registration.choose', { field: 'dog' })
      states.breeder = states.owner = states.qualifyingResults = true
    }
    return [texts, states]
  }, [errors, registration, restriction, t])

  // The address check needs the list of top-level domains; it is fetched here, once, so it has
  // arrived by the time anyone has typed an address (KOE-1347).
  useEffect(() => {
    void loadKnownTlds()
  }, [])

  useEffect(() => {
    setOpen(defaultSectionOpenState(large))
  }, [large])

  useEffect(() => {
    setValidationErrors(validateRegistration(registration, event, savedRegistration))

    const filtered = filterRelevantResults(
      event,
      registration?.class,
      registration?.dog?.results ?? [],
      registration?.results
    )
    setRankingPeriod({ max: filtered.maxResultDate, min: filtered.minResultDate })
    const newState = { ...registration, qualifies: filtered.qualifies, qualifyingResults: filtered.relevant }

    if (hasChanges(savedRegistration ?? registration, newState)) {
      if (isDevEnv()) {
        console.log('changes', getDiffOperations(savedRegistration ?? registration, newState))
      }
      handleChange({ qualifies: filtered.qualifies, qualifyingResults: filtered.relevant })
    }
  }, [event, handleChange, registration, savedRegistration])

  useEffect(() => {
    // A new registration follows the user's stored language choice. The single writer: i18n itself
    // realigns to the same atom in App, so no second effect may tug the field back (KOE-1268).
    if (!registration.id && registration.language !== language) {
      handleChange?.({ language })
    }
  }, [language, handleChange, registration.language, registration.id])

  useEffect(() => {
    // An unset selection defaults to the (first) owner; a key that resolves to no owner (stale
    // cache, concurrent owner-list change) is remapped the same way, so the form never holds a
    // selection that names nobody. Once the people or the memberships are locked the stored selection
    // stands: remapping a key that names nobody to the first owner changes who handles (KOE-1588).
    if (locks.people || locks.membership) return
    const normalizeSelection = (selection: boolean | string | undefined): boolean | string => {
      if (typeof selection === 'string') {
        return resolveOwnerSelection(registration.owners, registration.owner, selection) ? selection : true
      }
      return withDefaultOwnerSelection(selection)
    }
    const ownerHandles = normalizeSelection(registration.ownerHandles)
    const ownerPays = normalizeSelection(registration.ownerPays)

    if (registration.ownerHandles !== ownerHandles || registration.ownerPays !== ownerPays) {
      handleChange({ ownerHandles, ownerPays })
    }
  }, [
    handleChange,
    locks.membership,
    locks.people,
    registration.ownerHandles,
    registration.ownerPays,
    registration.owners,
    registration.owner,
  ])

  useEffect(() => {
    // A lock that arrives while the participant edits (the picking or the payment, by the WebSocket),
    // or a draft kept from before it, puts the locked sections back as stored: the server would refuse
    // the save otherwise (KOE-1588). What comes back has no locked change left, since a stored row is
    // never a change against itself (`storedOwnersOf`), so the next run finds nothing to put back. The
    // participant is told which section and why, whatever brought the change in: the same put-back
    // serves an edit, a lock that arrives and a draft kept from before it.
    // It reads `locks` on purpose: with TYPED_DOG_ONLY_LOCKS it would fight RegistrationEditDialog's
    // own class and eventType writes, and `typedDogChange` already keeps the rest out (KOE-1650).
    if (!savedRegistration) return
    const section = participantLockedChange(locks, savedRegistration, registration)
    if (!section) return
    const restored = withLockedSectionsFrom(savedRegistration, registration, locks)
    setLockedNotice({ reason: getParticipantLockReason(section, savedRegistration), section })
    onChange?.(restored)
  }, [locks, onChange, registration, savedRegistration])

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
      <Box
        sx={{
          '& .fact input.Mui-disabled': {
            color: 'success.main',
            WebkitTextFillColor: (theme) => theme.palette.success.main,
          },
          '& .MuiInputBase-root': {
            bgcolor: 'background.default',
          },
          bgcolor: 'background.form',
          borderRadius: 1,
          minWidth: 350,
          overflow: 'auto',
          pb: 0.5,
        }}
      >
        {lockedNotice ? (
          <LockedChangeNotice
            onClose={() => setLockedNotice(undefined)}
            reason={lockedNotice.reason}
            section={lockedNotice.section}
          />
        ) : null}
        {admin && onInternalNotesChange && registration.id ? (
          <InternalNotesInfo
            disabled={freeDisabled}
            notes={registration.internalNotes}
            onChange={onInternalNotesChange}
            onOpenChange={(value) => handleOpenChange('internalNotes', value)}
            open={open.internalNotes}
          />
        ) : null}
        <EntryInfo
          key={event.id}
          reg={registration}
          event={event}
          classDate={classDate}
          classDisabled={classDisabled}
          className={className}
          disabled={disabled || sectionLocks.entry}
          errorStates={errorStates}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('entry', value)}
          open={open.entry}
        />
        <DogInfo
          reg={registration}
          eventDate={event.startDate}
          minDogAgeMonths={minDogAgeFor(event.eventType)}
          disabled={disabled || sectionLocks.dog}
          typedDogOnly={typedDogOnly}
          error={errorStates.dog}
          helperText={helperTexts.dog}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('dog', value)}
          open={open.dog}
          orgId={event.organizer.id}
        />
        <BreederInfo
          reg={registration}
          disabled={disabled || sectionLocks.people}
          error={errorStates.breeder}
          helperText={helperTexts.breeder}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('breeder', value)}
          open={open.breeder}
        />
        <OwnerInfo
          admin={admin}
          reg={registration}
          disabled={disabled || sectionLocks.people}
          error={errorStates.owner}
          membershipLocked={locks.membership}
          helperText={helperTexts.owner}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('owner', value)}
          open={open.owner}
          orgId={event.organizer.id}
        />
        <Collapse in={selectsSomeoneElse(registration.ownerHandles)}>
          <HandlerInfo
            admin={admin}
            reg={registration}
            disabled={disabled || sectionLocks.people}
            error={errorStates.handler}
            lockedMembership={locks.membership ? lockedHandlerClaim : undefined}
            helperText={helperTexts.handler}
            onChange={handleChange}
            onOpenChange={(value) => handleOpenChange('handler', value)}
            open={open.handler}
            orgId={event.organizer.id}
          />
        </Collapse>
        <Collapse in={selectsSomeoneElse(registration.ownerPays)}>
          <PayerInfo
            reg={registration}
            disabled={freeDisabled}
            error={errorStates.payer}
            helperText={helperTexts.payer}
            onChange={handleChange}
            onOpenChange={(value) => handleOpenChange('payer', value)}
            open={open.payer}
          />
        </Collapse>
        <QualifyingResultsInfo
          eventType={event.eventType}
          regNo={registration.dog?.regNo}
          dob={registration.dog?.dob}
          disabled={disabled || sectionLocks.results}
          rankingPeriod={rankingPeriod}
          requirements={requirements}
          results={registration.results}
          qualifyingResults={registration.qualifyingResults}
          error={!qualifies || errorStates.qualifyingResults}
          helperText={helperTexts.qualifyingResults}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('qr', value)}
          open={open.qr}
        />
        <AdditionalInfo
          disabled={freeDisabled}
          notes={registration.notes}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('info', value)}
          open={open.info}
        />
        <MembershipInfo
          disabled={disabled || sectionLocks.membership}
          error={restriction?.section === 'membership'}
          helperText={restriction?.section === 'membership' ? restriction.text : undefined}
          reg={registration}
          orgId={event.organizer.id}
          onChange={handleChange}
        />
        <PaymentInfo
          event={event}
          registration={registration}
          cost={costResult}
          disabled={disabled || sectionLocks.payment}
          onChange={handleChange}
        />
        <Box sx={{ borderTop: '1px solid #bdbdbd', p: 1, pl: 4 }}>
          <FormControl error={errorStates.agreeToTerms} disabled={!!registration.id}>
            <FormControlLabel
              disabled={disabled || sectionLocks.payment}
              control={
                <Checkbox
                  checked={registration.agreeToTerms}
                  onChange={(e) => handleChange({ agreeToTerms: e.target.checked })}
                />
              }
              label={
                <Trans
                  t={t}
                  i18nKey="registration.terms"
                  components={{
                    2: (
                      <Link
                        target="_blank"
                        rel="noopener"
                        href="https://yttmk.yhdistysavain.fi/noutajien-metsastyskokeet-2/ohjeistukset/kokeen-ja-tai-kilpailun-ilmoitta/"
                      />
                    ),
                    6: <Link target="_blank" rel="noopener" href="https://www.snj.fi/snj/tietosuojaseloste/" />,
                  }}
                />
              }
              name="agreeToTerms"
            />
          </FormControl>
          <FormHelperText error>{helperTexts.agreeToTerms}</FormHelperText>
        </Box>
      </Box>

      <Stack
        direction="row"
        sx={{
          justifyContent: 'flex-end',
          p: 1,
        }}
      >
        <PaymentDetails event={event} registration={registration} />
      </Stack>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'flex-end',
          px: 2,
        }}
      >
        <Typography
          sx={{
            fontWeight: 'bold',
          }}
        >
          {/* The same facts as the pay offer: what is shown as owed, and whether paying waits for a
              place, which the server's picture or the group tells, not the confirmation (KOE-1526). */}
          {t(waitsForPlace ? 'registration.paymentToBePaidAfterConfirmation' : 'registration.paymentToBePaid', {
            amount: formatMoney(paymentDue),
          })}
        </Typography>
      </Stack>

      <Stack
        spacing={1}
        direction="row"
        sx={{
          justifyContent: 'flex-end',
          p: 1,
        }}
      >
        <AsyncButton
          color="primary"
          disabled={disabled || !changes || !valid}
          onClick={onSave}
          startIcon={<CheckOutlined />}
          variant="contained"
        >
          {ctaText}
        </AsyncButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </Stack>
      {!valid && (
        <Accordion variant="outlined" sx={{ backgroundColor: 'background.form' }}>
          <AccordionSummary expandIcon={<ExpandMore />}>{t('registration.accordionTitle')}</AccordionSummary>
          <AccordionDetails data-testid="missing-info">
            {t('registration.accordionInfo')}
            <ul style={{ margin: 0 }}>
              {errors.map((e) => (
                <li key={`error-${e.opts.field}`}>
                  {/* Not every Registration field has a translation; fall back to the field name. */}
                  {t(`registration.${e.opts.field}` as ParseKeys<'translation'>, { defaultValue: e.opts.field })}{' '}
                </li>
              ))}
              {qualifies ? null : <li>{t('registration.qualifyingResults')}</li>}
              {restriction && !errors.some((e) => e.opts.field === restriction.section) ? (
                <li>{t(restriction.section === 'dog' ? 'registration.dog' : 'registration.membership')}</li>
              ) : null}
            </ul>
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  )
}

/**
 * The entry restriction (KOE-524) the registration does not meet (KOE-525), and the section that
 * says so: the membership section when membership would admit the dog, otherwise the dog's own.
 */
function getRestrictionNotice(
  event: PublicConfirmedEvent,
  registration: Registration,
  t: TFunction<['translation', 'breed']>
): { section: 'dog' | 'membership'; text: string } | undefined {
  if (meetsRestrictions(event, registration)) return undefined

  const options = priorityValuesToPriority(event.restrictions, RESTRICTION).sort(getPrioritySort(t))
  const breeds = options
    .filter((option) => option.value !== PRIORITY_MEMBER)
    .map((option) => t(option.name))
    .join(', ')
  if (!options.some((option) => option.value === PRIORITY_MEMBER)) {
    return { section: 'dog', text: t('validation.registration.restrictedToBreeds', { breeds }) }
  }
  const key = breeds
    ? 'validation.registration.restrictedToMembersOrBreeds'
    : 'validation.registration.restrictedToMembers'
  return { section: 'membership', text: t(key, { breeds }) }
}

function getSectionHelperTexts(
  registration: Registration,
  t: TFunction<'translation', undefined>
): { [Property in keyof Registration]?: string } {
  return {
    breeder: registration.breeder?.name || '',
    dog: registration.dog?.regNo ? `${registration.dog.regNo} - ${registration.dog.name}` : '',
    handler: getHandlingPerson(registration)?.name || '',
    owner: formatOwnerNames(registration),
    payer: getPayingPerson(registration)?.name || '',
    qualifyingResults: t('registration.qualifyingResultsInfo', {
      class: registration.class,
      eventType: registration.eventType,
      qualifies: t(registration.qualifies ? 'registration.qualifyingResultsYes' : 'registration.qualifyingResultsNo'),
    }),
    reserve: t('registration.reserveHelp'),
  }
}
