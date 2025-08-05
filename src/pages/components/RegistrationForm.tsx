import type { Theme } from '@mui/material'
import type { TFunction } from 'i18next'
import type {
  DeepPartial,
  Language,
  ManualTestResult,
  PublicConfirmedEvent,
  Registration,
  TestResult,
} from '../../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
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
import { diff } from 'deep-object-diff'

import { calculateCost } from '../../lib/cost'
import { isDevEnv } from '../../lib/env'
import { formatMoney } from '../../lib/money'
import { hasChanges, merge } from '../../lib/utils'
import { getRequirements } from '../../rules'

import { AdditionalInfo } from './registrationForm/AdditionalInfo'
import { BreederInfo } from './registrationForm/BreederInfo'
import { DogInfo } from './registrationForm/DogInfo'
import { EntryInfo } from './registrationForm/EntryInfo'
import { HandlerInfo } from './registrationForm/HandlerInfo'
import MembershipInfo from './registrationForm/MembershipInfo'
import { OwnerInfo } from './registrationForm/OwnerInfo'
import { PayerInfo } from './registrationForm/PayerInfo'
import PaymentInfo from './registrationForm/PaymentInfo'
import QualifyingResultsInfo from './registrationForm/QualifyingResultsInfo'
import { filterRelevantResults, validateRegistration } from './registrationForm/validation'
import { AsyncButton } from './AsyncButton'
import { PaymentDetails } from './PaymentDetails'

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
  readonly onSave?: () => Promise<void>
  readonly registration: Registration
  readonly savedRegistration?: Registration | null
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
  onSave,
  registration,
  savedRegistration,
}: Props) {
  const { t, i18n } = useTranslation()
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [errors, setErrors] = useState(validateRegistration(registration, event))
  const [open, setOpen] = useState<{ [key: string]: boolean | undefined }>({})
  const [rankingPeriod, setRankingPeriod] = useState<{ min?: Date; max?: Date }>({})

  const valid = errors.length === 0 && registration.qualifies
  const costResult = calculateCost(event, registration)
  const paymentAmount = costResult.amount
  const ctaText = useMemo(() => {
    if (registration.id) return t('registration.cta.saveChanges')
    if (admin) return t('registration.cta.confirmAndSendLink')
    if (event.paymentTime === 'confirmation') return t('registration.cta.confirmRegistration')
    return t('registration.cta.confirmAndPay')
  }, [admin, registration.id, event.paymentTime, t])

  const disabledForUserAfterPaid = !admin && !!registration.paidAt
  const disabledForUserAfterPicked = !admin && !!registration.messagesSent?.picked

  const requirements = useMemo(
    () =>
      getRequirements(
        registration?.eventType ?? '',
        registration?.class,
        registration?.dates && registration.dates.length ? registration.dates[0].date : new Date()
      ),
    [registration?.eventType, registration?.class, registration?.dates]
  )

  const handleChange = useCallback(
    (props: DeepPartial<Registration> | undefined = {}, replace?: boolean) => {
      if (disabled) return

      // Process results and qualifications
      if (props.class || props.results || props.dog?.results || (props.dog && !registration.qualifies)) {
        const cls = props.class ?? registration.class
        const dogResults = props.dog?.results ?? registration.dog?.results ?? []
        const results = props.results ?? registration.results ?? []
        const filtered = filterRelevantResults(event, cls, dogResults as TestResult[], results as ManualTestResult[])
        props.qualifyingResults = filtered.relevant
        props.qualifies = filtered.qualifies
        setRankingPeriod({ min: filtered.minResultDate, max: filtered.maxResultDate })
      }

      // Create new state by merging or replacing
      const newState = replace ? Object.assign({}, registration, props) : merge<Registration>(registration, props ?? {})

      // Only update if there are actual changes
      if (hasChanges(registration, newState)) {
        // We need to update the parent component immediately for the local UI to reflect changes
        onChange?.(newState)

        if (isDevEnv()) {
          console.debug('changed', diff(registration, newState))
        }
      }
    },
    [disabled, registration, event, onChange]
  )

  const handleOpenChange = useCallback(
    (id: keyof typeof open, value: boolean) => {
      const newState = large
        ? {
            ...open,
            [id]: value,
          }
        : {
            entry: false,
            dog: false,
            breeder: false,
            owner: false,
            handler: registration.ownerHandles,
            payer: registration.ownerPays,
            qr: false,
            info: false,
            [id]: value,
          }
      setOpen(newState)
    },
    [large, open, registration.ownerHandles, registration.ownerPays]
  )

  const [helperTexts, errorStates] = useMemo(() => {
    const states: { [Property in keyof Registration]?: boolean } = {}
    const texts = getSectionHelperTexts(registration, t)
    for (const error of errors) {
      texts[error.opts.field] = t(`validation.registration.${error.key}`, error.opts)
      states[error.opts.field] = true
    }
    if (!registration?.dog?.regNo) {
      texts.breeder = texts.owner = texts.qualifyingResults = t('validation.registration.choose', { field: 'dog' })
      states.breeder = states.owner = states.qualifyingResults = true
    }
    return [texts, states]
  }, [errors, registration, t])

  useEffect(() => {
    setOpen({
      entry: true,
      dog: large,
      breeder: large,
      owner: large,
      handler: large,
      qr: large,
      info: large,
    })
  }, [large])

  useEffect(() => {
    setErrors(validateRegistration(registration, event))

    const filtered = filterRelevantResults(
      event,
      registration?.class,
      registration?.dog?.results ?? [],
      registration?.results
    )
    setRankingPeriod({ min: filtered.minResultDate, max: filtered.maxResultDate })
    const newState = { ...registration, qualifies: filtered.qualifies, qualifyingResults: filtered.relevant }

    if (hasChanges(savedRegistration ?? registration, newState)) {
      if (isDevEnv()) {
        console.log('changes', diff(savedRegistration ?? registration, newState))
      }
      handleChange({ qualifies: filtered.qualifies, qualifyingResults: filtered.relevant })
    }
  }, [event, handleChange, registration, savedRegistration])

  useEffect(() => {
    // update language on new registrations
    if (!registration.id && i18n.language !== registration.language) {
      handleChange?.({ language: i18n.language as Language })
    }
  }, [i18n.language, handleChange, registration.language, registration.id])

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
      <Box
        sx={{
          pb: 0.5,
          overflow: 'auto',
          borderRadius: 1,
          bgcolor: 'background.form',
          '& .MuiInputBase-root': {
            bgcolor: 'background.default',
          },
          '& .fact input.Mui-disabled': {
            color: 'success.main',
            WebkitTextFillColor: (theme) => theme.palette.success.main,
          },
          minWidth: 350,
        }}
      >
        <EntryInfo
          reg={registration}
          event={event}
          classDate={classDate}
          classDisabled={classDisabled}
          className={className}
          disabled={disabled || disabledForUserAfterPicked}
          errorStates={errorStates}
          helperTexts={helperTexts}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('entry', value)}
          open={open.entry}
        />
        <DogInfo
          reg={registration}
          eventDate={event.startDate}
          minDogAgeMonths={9}
          disabled={disabled || disabledForUserAfterPaid}
          error={errorStates.dog}
          helperText={helperTexts.dog}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('dog', value)}
          open={open.dog}
          orgId={event.organizer.id}
        />
        <BreederInfo
          reg={registration}
          disabled={disabled || disabledForUserAfterPicked}
          error={errorStates.breeder}
          helperText={helperTexts.breeder}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('breeder', value)}
          open={open.breeder}
        />
        <OwnerInfo
          admin={admin}
          reg={registration}
          disabled={disabled || disabledForUserAfterPicked}
          error={errorStates.owner}
          helperText={helperTexts.owner}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('owner', value)}
          open={open.owner}
          orgId={event.organizer.id}
        />
        <Collapse in={!registration.ownerHandles}>
          <HandlerInfo
            admin={admin}
            reg={registration}
            disabled={disabled || disabledForUserAfterPicked}
            error={errorStates.handler}
            helperText={helperTexts.handler}
            onChange={handleChange}
            onOpenChange={(value) => handleOpenChange('handler', value)}
            open={open.handler}
            orgId={event.organizer.id}
          />
        </Collapse>
        <Collapse in={!registration.ownerPays}>
          <PayerInfo
            reg={registration}
            disabled={disabled}
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
          disabled={disabled || disabledForUserAfterPicked}
          rankingPeriod={rankingPeriod}
          requirements={requirements}
          results={registration.results}
          qualifyingResults={registration.qualifyingResults}
          error={!registration.qualifies || errorStates.qualifyingResults}
          helperText={helperTexts.qualifyingResults}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('qr', value)}
          open={open.qr}
        />
        <AdditionalInfo
          disabled={disabled}
          notes={registration.notes}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('info', value)}
          open={open.info}
        />
        <MembershipInfo
          disabled={disabled || disabledForUserAfterPaid}
          reg={registration}
          orgId={event.organizer.id}
          onChange={handleChange}
        />
        <PaymentInfo
          event={event}
          registration={registration}
          cost={costResult}
          disabled={disabled || disabledForUserAfterPaid}
          onChange={handleChange}
        />
        <Box sx={{ p: 1, pl: 4, borderTop: '1px solid #bdbdbd' }}>
          <FormControl error={errorStates.agreeToTerms} disabled={!!registration.id}>
            <FormControlLabel
              disabled={disabled || disabledForUserAfterPaid}
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

      <Stack direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
        <PaymentDetails event={event} registration={registration} />
      </Stack>
      <Stack direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
        {event.paymentTime === 'confirmation' && !registration.confirmed ? (
          <b>
            {t('registration.paymentToBePaidAfterConfirmation', {
              amount: formatMoney(paymentAmount - (registration.paidAmount ?? 0)),
            })}
          </b>
        ) : (
          <b>
            {t('registration.paymentToBePaid', {
              amount: formatMoney(paymentAmount - (registration.paidAmount ?? 0)),
            })}
          </b>
        )}
      </Stack>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
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
              {errors.map((e, i) => (
                <li key={i}>{t(`registration.${e.opts.field}` as any)} </li>
              ))}
              {!registration.qualifies ? <li>{t('registration.qualifyingResults')}</li> : null}
            </ul>
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  )
}

function getSectionHelperTexts(
  registration: Registration,
  t: TFunction<'translation', undefined>
): { [Property in keyof Registration]?: string } {
  return {
    breeder: `${registration.breeder?.name || ''}`,
    dog: registration.dog?.regNo ? `${registration.dog.regNo} - ${registration.dog.name}` : '',
    handler: registration.ownerHandles ? t('registration.ownerHandles') : `${registration.handler?.name || ''}`,
    owner: `${registration.owner?.name || ''}`,
    payer: registration.ownerPays ? t('registration.ownerPays') : `${registration.payer?.name || ''}`,
    qualifyingResults: t('registration.qualifyingResultsInfo', {
      class: registration.class,
      eventType: registration.eventType,
      qualifies: t(registration.qualifies ? 'registration.qualifyingResultsYes' : 'registration.qualifyingResultsNo'),
    }),
    reserve: t('registration.reserveHelp'),
  }
}
