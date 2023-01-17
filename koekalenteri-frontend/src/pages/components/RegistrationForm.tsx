import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cancel, Save } from '@mui/icons-material'
import { Box, Button, Checkbox, Collapse, FormControl, FormControlLabel, FormHelperText, Link, Paper, Stack, Theme, useMediaQuery } from '@mui/material'
import { TFunction } from 'i18next'
import { ConfirmedEvent, DeepPartial, Registration } from 'koekalenteri-shared/model'
import { applyDiff, getDiff } from 'recursive-diff'

import { EntryInfo } from './registrationForm/1.Entry'
import { DogInfo } from './registrationForm/2.Dog'
import { BreederInfo } from './registrationForm/3.Breeder'
import { OwnerInfo } from './registrationForm/4.OwnerInfo'
import { HandlerInfo } from './registrationForm/5.HandlerInfo'
import { QualifyingResultsInfo } from './registrationForm/6.QualifyingResultsInfo'
import { AdditionalInfo } from './registrationForm/7.AdditionalInfo'
import { RegistrationClass } from './registrationForm/rules'
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
  refreshDate: undefined,
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

export default function RegistrationForm({ event, className, registration, classDate, changes, onSave, onCancel, onChange }: Props) {
  const { t } = useTranslation()
  //const eventTypeClasses = useRecoilValue(eventTypeClassesAtom)
  //const eventHasClasses = useMemo(() => eventTypeClasses[event.eventType]?.length > 0, [event.eventType, eventTypeClasses])
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const relevantResults = useMemo(() => filterRelevantResults(event, registration.class as RegistrationClass, registration.dog?.results ?? []), [event, registration.class, registration.dog.results])
  const qualifies = relevantResults.qualifies
  const [errors, setErrors] = useState(validateRegistration(registration, event))
  const [open, setOpen] = useState<{ [key: string]: boolean | undefined }>({})
  const valid = errors.length === 0

  const handleChange = useCallback((props: DeepPartial<Registration>) => {
    const diff = getDiff({}, {...props, qualifyingResults: relevantResults.relevant})
    if (diff.length) {
      const newState = applyDiff(structuredClone(registration), diff) as Registration
      console.log('change', {changes: props, diff})
      setErrors(validateRegistration(newState, event))
      onChange?.(newState)
    }
  }, [event, onChange, registration, relevantResults])


  /*
  const onChange = (props: Partial<Registration>) => {
    console.log('Changes: ' + JSON.stringify(props))
    if (props.class && !props.dates) {
      const allCount = getRegistrationDates(event, classDate, registration.class || '').length
      const available = getRegistrationDates(event, classDate, props.class)
      if (registration.dates.length === allCount) {
        registration.dates = available
      } else {
        props.dates = registration.dates.filter(rd => available.find(a => a.date.valueOf() === rd.date.valueOf() && a.time === rd.time))
      }
    }
    if (props.class || props.dog || props.results) {
      const c = props.class || registration.class
      const dog = props.dog || registration.dog
      const filtered = filterRelevantResults(event, c as RegistrationClass, dog.results, props.results || registration.results)
      setQualifies((!dog.regNo || (eventHasClasses && !c)) ? null : filtered.qualifies)
      props.qualifyingResults = filtered.relevant
    }
    if (props.ownerHandles || (props.owner && registration.ownerHandles)) {
      props.handler = { ...registration.owner, ...props.owner }
    }
    if (props.ownerHandles) {
      setOpen({ ...open, handler: true })
    }
    const newState = { ...local, ...props }
    setErrors(validateRegistration(newState, event))
    setLocal(newState)
    setChanges(true)
    setSaving(false)
  }
  */

  const handleOpenChange = useCallback((id: keyof typeof open, value: boolean) => {
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
  }, [large, open, registration.ownerHandles])

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
    <Paper elevation={2} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto', maxHeight: '100%', maxWidth: '100%' }}>
      <Box sx={{
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
      }}>
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
          reg={registration}
          error={!qualifies}
          helperText={helperTexts.qualifyingResults}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('qr', value)}
          open={open.qr}
        />
        <AdditionalInfo
          reg={registration}
          onChange={handleChange}
          onOpenChange={(value) => handleOpenChange('info', value)}
          open={open.info}
        />
        <Box sx={{ m: 1, mt: 2, ml: 4, borderTop: '1px solid #bdbdbd' }}>
          <FormControl error={errorStates.agreeToTerms} disabled={!!registration.id}>
            <FormControlLabel control={<Checkbox checked={registration.agreeToTerms} onChange={e => handleChange({ agreeToTerms: e.target.checked })} />} label={
              <>
                <span>{t('registration.terms.read')}</span>&nbsp;
                <Link target="_blank" rel="noopener" href={t('registration.terms.url')}>{t('registration.terms.terms')}</Link>
                &nbsp;<span>{t('registration.terms.agree')}</span>
              </>
            } />
          </FormControl>
          <FormHelperText error>{helperTexts.agreeToTerms}</FormHelperText>
          <FormControl error={errorStates.agreeToPublish} disabled={!!registration.id}>
            <FormControlLabel control={<Checkbox checked={registration.agreeToPublish} onChange={e => handleChange({ agreeToPublish: e.target.checked })} />} label={t('registration.terms.publish')} />
          </FormControl>
          <FormHelperText error>{helperTexts.agreeToPublish}</FormHelperText>
        </Box>
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{ p: 1, borderTop: '1px solid', borderColor: '#bdbdbd' }}>
        <Button color="primary" disabled={!changes || !valid} startIcon={<Save />} variant="contained" onClick={onSave}>{registration.id ? 'Tallenna muutokset' : 'Tallenna'}</Button>
        <Button startIcon={<Cancel />} variant="outlined" onClick={onCancel}>Peruuta</Button>
      </Stack>
    </Paper>
  )
}

function getSectionHelperTexts(
  registration: Registration,
  qualifies: boolean | null,
  t: TFunction<"translation", undefined>,
): { [Property in keyof Registration]?: string } {
  return {
    breeder: `${registration.breeder?.name || ''}`,
    dog: registration.dog ? `${registration.dog.regNo} - ${registration.dog.name}` : '',
    handler: registration.ownerHandles ? t('registration.ownerHandles') : `${registration.handler?.name || ''}`,
    owner: `${registration.owner?.name || ''}`,
    qualifyingResults: qualifies === null ? '' : t('registration.qualifyingResultsInfo', { qualifies: t(qualifies ? 'registration.qyalifyingResultsYes' : 'registration.qualifyingResultsNo') }),
  }
}
