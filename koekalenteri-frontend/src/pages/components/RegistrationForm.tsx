import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Cancel, Save } from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Link,
  Paper,
  Stack,
  Theme,
  useMediaQuery,
} from '@mui/material'
import { diff } from 'deep-object-diff'
import { TFunction } from 'i18next'
import { ConfirmedEvent, DeepPartial, Registration, TestResult } from 'koekalenteri-shared/model'

import { getRequirements, RegistrationClass } from '../../rules'
import { hasChanges, merge } from '../../utils'

import { EntryInfo } from './registrationForm/1.Entry'
import { BreederInfo } from './registrationForm/3.Breeder'
import { OwnerInfo } from './registrationForm/4.OwnerInfo'
import { HandlerInfo } from './registrationForm/5.HandlerInfo'
import { AdditionalInfo } from './registrationForm/AdditionalInfo'
import { DogInfo } from './registrationForm/DogInfo'
import QualifyingResultsInfo from './registrationForm/QualifyingResultsInfo'
import { filterRelevantResults, validateRegistration } from './registrationForm/validation'

interface Props {
  event: ConfirmedEvent
  registration: Registration
  className?: string
  classDate?: string
  changes?: boolean
  onSave?: () => void
  onCancel?: () => void
  onChange?: (registration: Registration) => void
}

export const emptyDog = {
  regNo: '',
  results: [],
}
export const emptyBreeder = {
  name: '',
  location: '',
}
export const emptyPerson = {
  name: '',
  phone: '',
  email: '',
  location: '',
  membership: false,
}

export default function RegistrationForm({
  event,
  className,
  registration,
  classDate,
  changes,
  onSave,
  onCancel,
  onChange,
}: Props) {
  const { t } = useTranslation()
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [qualifies, setQualifies] = useState<boolean>(
    filterRelevantResults(
      event,
      registration.class as RegistrationClass,
      registration.dog?.results ?? [],
      registration.results
    ).qualifies
  )
  const [errors, setErrors] = useState(validateRegistration(registration, event))
  const [open, setOpen] = useState<{ [key: string]: boolean | undefined }>({})
  const [saving, setSaving] = useState(false)
  const valid = errors.length === 0 && qualifies

  const requirements = useMemo(
    () =>
      getRequirements(
        registration.eventType ?? '',
        registration.class as RegistrationClass,
        registration.dates && registration.dates.length ? registration.dates[0].date : new Date()
      ),
    [registration.eventType, registration.class, registration.dates]
  )

  const handleChange = useCallback(
    (props: DeepPartial<Registration>, replace?: boolean) => {
      if (props.class || props.results || props.dog?.results) {
        const cls = props.class ?? registration.class
        const dogResults = props.dog?.results ?? registration.dog.results ?? []
        const results = props.results ?? registration.results ?? []
        const filtered = filterRelevantResults(event, cls as RegistrationClass, dogResults as TestResult[], results)
        props.qualifyingResults = filtered.relevant
        setQualifies(filtered.qualifies)
      }
      const newState = replace ? Object.assign({}, registration, props) : merge<Registration>(registration, props)
      if (hasChanges(registration, newState)) {
        console.debug('change', { changes: props, diff: diff(registration, newState) })
        setErrors(validateRegistration(newState, event))
        onChange?.(newState)
      }
    },
    [event, onChange, registration]
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
            qr: false,
            info: false,
            [id]: value,
          }
      setOpen(newState)
    },
    [large, open, registration.ownerHandles]
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    onSave?.()
  }, [onSave])

  const [helperTexts, errorStates] = useMemo(() => {
    const states: { [Property in keyof Registration]?: boolean } = {}
    const texts = getSectionHelperTexts(registration, qualifies, t)
    for (const error of errors) {
      texts[error.opts.field] = t(`validation.registration.${error.key}`, error.opts)
      states[error.opts.field] = true
    }
    return [texts, states]
  }, [errors, qualifies, registration, t])

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
            WebkitTextFillColor: 'inherit',
          },
        }}
      >
        <EntryInfo
          reg={registration}
          event={event}
          classDate={classDate}
          className={className}
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
          error={errorStates.dog}
          helperText={helperTexts.dog}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('dog', value)}
          open={open.dog}
        />
        <BreederInfo
          reg={registration}
          error={errorStates.breeder}
          helperText={helperTexts.breeder}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('breeder', value)}
          open={open.breeder}
        />
        <OwnerInfo
          reg={registration}
          error={errorStates.owner}
          helperText={helperTexts.owner}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('owner', value)}
          open={open.owner}
        />
        <Collapse in={!registration.ownerHandles}>
          <HandlerInfo
            reg={registration}
            error={errorStates.handler}
            helperText={helperTexts.handler}
            onChange={handleChange}
            onOpenChange={(value) => handleOpenChange('handler', value)}
            open={open.handler}
          />
        </Collapse>
        <QualifyingResultsInfo
          regNo={registration.dog?.regNo}
          requirements={requirements}
          results={registration.results}
          qualifyingResults={registration.qualifyingResults}
          error={!qualifies}
          helperText={helperTexts.qualifyingResults}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('qr', value)}
          open={open.qr}
        />
        <AdditionalInfo
          notes={registration.notes}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('info', value)}
          open={open.info}
        />
        <Box sx={{ m: 1, mt: 2, ml: 4, borderTop: '1px solid #bdbdbd' }}>
          <FormControl error={errorStates.agreeToTerms} disabled={!!registration.id}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={registration.agreeToTerms}
                  onChange={(e) => handleChange({ agreeToTerms: e.target.checked })}
                />
              }
              label={
                <Trans t={t} i18nKey="registration.terms">
                  Hyväksyn{' '}
                  <Link
                    target="_blank"
                    rel="noopener"
                    href="https://yttmk.yhdistysavain.fi/noutajien-metsastyskokeet-2/ohjeistukset/kokeen-ja-tai-kilpailun-ilmoitta/"
                  >
                    ilmoittautmisen ehdot
                  </Link>{' '}
                  ja{' '}
                  <Link target="_blank" rel="noopener" href="https://www.snj.fi/snj/tietosuojaseloste/">
                    tietosuojaselosteen
                  </Link>
                </Trans>
              }
            />
          </FormControl>
          <FormHelperText error>{helperTexts.agreeToTerms}</FormHelperText>
        </Box>
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
          loading={saving}
          onClick={handleSave}
          startIcon={<Save />}
          variant="contained"
        >
          {registration.id ? 'Tallenna muutokset' : 'Tallenna'}
        </LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={onCancel}>
          Peruuta
        </Button>
      </Stack>
    </Paper>
  )
}

function getSectionHelperTexts(
  registration: Registration,
  qualifies: boolean,
  t: TFunction<'translation', undefined>
): { [Property in keyof Registration]?: string } {
  return {
    breeder: `${registration.breeder?.name || ''}`,
    dog: registration.dog ? `${registration.dog.regNo} - ${registration.dog.name}` : '',
    handler: registration.ownerHandles ? t('registration.ownerHandles') : `${registration.handler?.name || ''}`,
    owner: `${registration.owner?.name || ''}`,
    qualifyingResults: t('registration.qualifyingResultsInfo', {
      qualifies: t(qualifies ? 'registration.qyalifyingResultsYes' : 'registration.qualifyingResultsNo'),
    }),
  }
}
