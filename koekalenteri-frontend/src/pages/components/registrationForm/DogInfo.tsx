import { SyntheticEvent, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CachedOutlined } from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import { Autocomplete, FormControl, FormHelperText, Grid, Stack, TextField, TextFieldProps } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { differenceInMinutes, subMonths, subYears } from 'date-fns'
import { BreedCode, DeepPartial, Dog, DogGender, Registration } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import { hasChanges } from '../../../utils'
import { DogCachedInfo, useDogActions } from '../../recoil/dog'
import { cachedDogRegNumbersSelector } from '../../recoil/dog/selectors'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

import { TitlesAndName } from './dogInfo/TitlesAndName'
import { validateRegNo } from './validation'

export function shouldAllowRefresh(dog?: DeepPartial<Dog>) {
  if (!dog || !dog.regNo) {
    return false
  }
  if (dog.refreshDate && differenceInMinutes(new Date(), dog.refreshDate) <= 5) {
    return false
  }
  return !!dog.refreshDate
}

interface Props {
  reg: DeepPartial<Registration>
  eventDate: Date
  minDogAgeMonths: number
  error?: boolean
  helperText?: string
  onChange?: (props: DeepPartial<Registration>, replace?: boolean) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export const DogInfo = ({
  reg,
  eventDate,
  minDogAgeMonths,
  error,
  helperText,
  onChange,
  onOpenChange,
  open,
}: Props) => {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const [inputRegNo, setInputRegNo] = useState<string>(reg?.dog?.regNo ?? '')
  const [mode, setMode] = useState<'fetch' | 'manual' | 'update' | 'invalid' | 'notfound' | 'autofetch'>(
    inputRegNo ? 'update' : 'fetch'
  )
  const disabled = mode !== 'manual'
  const validRegNo = validateRegNo(inputRegNo)
  const [loading, setLoading] = useState(false)
  const allowRefresh = shouldAllowRefresh(reg?.dog)
  const cachedRegNos = useRecoilValue(cachedDogRegNumbersSelector)
  const actions = useDogActions(inputRegNo)

  const handleChange = useCallback(
    (props: DeepPartial<DogCachedInfo>) => {
      console.log('handleChange', { props })
      const cache = actions.updateCache(props)
      onChange?.({ dog: cache.dog })
    },
    [actions, onChange]
  )

  const updateDog = useCallback(
    (cache?: DeepPartial<DogCachedInfo>) => {
      const dog = cache?.dog ?? {}
      const oldDog = reg?.dog ?? {}
      let replace = false
      if (hasChanges(oldDog, dog)) {
        const changes: DeepPartial<Registration> = { dog: cache?.dog }
        if (reg?.dog?.regNo !== cache?.dog?.regNo) {
          changes.breeder = cache?.breeder
          changes.handler = cache?.handler
          changes.owner = cache?.owner
          changes.ownerHandles = cache?.owner?.ownerHandles ?? true
          changes.results = []
          replace = true
        }
        onChange?.(changes, replace)
      }
    },
    [onChange, reg?.dog]
  )

  const buttonClick = useCallback(async () => {
    if (loading) {
      return
    }
    setLoading(true)
    let delay = 10
    switch (mode) {
      case 'autofetch':
      case 'fetch':
        const cache = await actions.fetch()
        updateDog(cache)
        setMode(cache ? 'update' : 'notfound')
        delay = 500
        break
      case 'update':
        updateDog(await actions.refresh())
        delay = 500
        break
      case 'notfound':
        setMode('manual')
        break
      default:
        setInputRegNo('')
        setMode('fetch')
        break
    }
    setTimeout(() => setLoading(false), delay)
  }, [actions, loading, mode, updateDog])

  const handleRegNoChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== inputRegNo) {
        const upper = value.toLocaleUpperCase().trim()
        setInputRegNo(upper)
        setMode('fetch')
      }
    },
    [inputRegNo]
  )
  const handleRegNoSelect = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string | null) => {
      handleRegNoChange(event, value)
      setMode('autofetch')
    },
    [handleRegNoChange]
  )

  useEffect(() => {
    if (inputRegNo !== reg.dog?.regNo ?? '') {
      if ((validRegNo && mode === 'autofetch') || inputRegNo === '') {
        buttonClick()
      }
    }
  }, [buttonClick, inputRegNo, mode, reg.dog?.regNo, validRegNo])

  return (
    <CollapsibleSection
      title={t('registration.dog')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <Autocomplete
          id="txtReknro"
          disabled={!disabled}
          freeSolo
          renderInput={(props) => <TextField {...props} error={!validRegNo} label={t('dog.regNo')} />}
          value={inputRegNo ?? ''}
          inputValue={inputRegNo ?? ''}
          onChange={handleRegNoSelect}
          onInputChange={handleRegNoChange}
          options={cachedRegNos ?? []}
          sx={{ minWidth: 200 }}
        />
        <Stack alignItems="flex-start">
          <FormHelperText error={mode === 'notfound' || mode === 'invalid'}>
            {t(`registration.cta.helper.${mode}`, { date: reg?.dog?.refreshDate })}
          </FormHelperText>
          <LoadingButton
            disabled={!validRegNo || (mode === 'update' && !allowRefresh)}
            loading={loading}
            startIcon={<CachedOutlined />}
            size="small"
            variant="outlined"
            color="info"
            onClick={buttonClick}
          >
            {t(`registration.cta.${mode}`)}
          </LoadingButton>
        </Stack>
      </Stack>
      <Grid container spacing={1} sx={{ mt: 0.5 }}>
        <Grid item>
          <TextField
            className={disabled && reg?.dog?.rfid ? 'fact' : ''}
            disabled={disabled}
            fullWidth
            label={t('dog.rfid')}
            value={reg?.dog?.rfid || ''}
            error={!disabled && !reg?.dog?.rfid}
            onChange={(e) => handleChange({ dog: { rfid: e.target.value } })}
          />
        </Grid>
        <Grid item sx={{ width: 280 }}>
          <AutocompleteSingle<BreedCode | '', true>
            className={disabled && reg?.dog?.breedCode ? 'fact' : ''}
            disableClearable
            disabled={disabled}
            error={!disabled && !reg?.dog?.breedCode}
            getOptionLabel={(o) => (o ? breed(o) : '')}
            isOptionEqualToValue={(o, v) => o === v}
            label={t('dog.breed')}
            onChange={(value) => handleChange({ dog: { breedCode: value ? value : undefined } })}
            options={['122', '111', '121', '312', '110', '263']}
            value={reg?.dog?.breedCode}
          />
        </Grid>
        <Grid item xs={'auto'}>
          <FormControl sx={{ width: 146 }} className={disabled && reg?.dog?.dob ? 'fact' : ''}>
            <DatePicker
              defaultCalendarMonth={subYears(new Date(), 2)}
              disabled={disabled}
              inputFormat={t('dateFormat.long')}
              label={t('dog.dob')}
              mask={t('datemask')}
              maxDate={subMonths(eventDate, minDogAgeMonths)}
              minDate={subYears(new Date(), 15)}
              onChange={(value: any) => value && handleChange({ dog: { dob: value } })}
              openTo={'year'}
              renderInput={(params: JSX.IntrinsicAttributes & TextFieldProps) => <TextField {...params} />}
              value={reg?.dog?.dob || null}
              views={['year', 'month', 'day']}
            />
          </FormControl>
        </Grid>
        <Grid item xs={'auto'} sx={{ minWidth: 128 }}>
          <AutocompleteSingle<DogGender | '', true>
            className={disabled && reg?.dog?.gender ? 'fact' : ''}
            disableClearable
            disabled={disabled}
            error={!disabled && !reg?.dog?.gender}
            getOptionLabel={(o) => (o ? t(`dog.gender_choises.${o}`) : '')}
            isOptionEqualToValue={(o, v) => o === v}
            label={t('dog.gender')}
            onChange={(value) => handleChange({ dog: { gender: value ? value : undefined } })}
            options={['F', 'M'] as DogGender[]}
            value={reg?.dog?.gender || ''}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            className={disabled && reg?.dog?.breedCode ? 'fact' : ''}
            disabledTitles={disabled && mode !== 'update'}
            disabledName={disabled}
            id="dog"
            name={reg?.dog?.name}
            nameLabel={t('dog.name')}
            onChange={(props) => handleChange({ dog: props })}
            titles={reg?.dog?.titles}
            titlesLabel={t('dog.titles')}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabledTitles={disabled && mode !== 'update'}
            disabledName={disabled && mode !== 'update'}
            id="sire"
            name={reg?.dog?.sire?.name}
            nameLabel={t('dog.sire.name')}
            onChange={(props) => handleChange({ dog: { sire: props } })}
            titles={reg?.dog?.sire?.titles}
            titlesLabel={t('dog.sire.titles')}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabledTitles={disabled && mode !== 'update'}
            disabledName={disabled && mode !== 'update'}
            id="dam"
            name={reg?.dog?.dam?.name}
            nameLabel={t('dog.dam.name')}
            onChange={(props) => handleChange({ dog: { dam: props } })}
            titles={reg?.dog?.dam?.titles}
            titlesLabel={t('dog.dam.titles')}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
