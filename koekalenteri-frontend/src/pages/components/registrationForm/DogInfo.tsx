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

interface State {
  regNo: string
  mode: 'fetch' | 'manual' | 'update' | 'notfound' | 'autofetch'
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
  const [state, setState] = useState<State>({
    regNo: reg?.dog?.regNo ?? '',
    mode: reg?.dog?.regNo ? 'update' : 'fetch',
  })
  const disabled = state.mode !== 'manual'
  const validRegNo = validateRegNo(state.regNo)
  const [loading, setLoading] = useState(false)
  const allowRefresh = shouldAllowRefresh(reg?.dog)
  const cachedRegNos = useRecoilValue(cachedDogRegNumbersSelector)
  const actions = useDogActions(state.regNo)

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
    switch (state.mode) {
      case 'autofetch':
      case 'fetch':
        const cache = await actions.fetch()
        updateDog(cache)
        if (state.regNo) {
          setState((prev) => ({ ...prev, mode: cache?.dog?.regNo ? 'update' : 'notfound' }))
        }
        delay = 500
        break
      case 'update':
        updateDog(await actions.refresh())
        delay = 500
        break
      case 'notfound':
        setState((prev) => ({ ...prev, mode: 'manual' }))
        break
      default:
        setState({ regNo: '', mode: 'fetch' })
        break
    }
    setTimeout(() => setLoading(false), delay)
  }, [actions, loading, state.mode, state.regNo, updateDog])

  const handleRegNoChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.regNo) {
        const upper = value.toLocaleUpperCase().trim()
        setState({ regNo: upper, mode: 'fetch' })
      }
    },
    [state.regNo]
  )
  const handleRegNoSelect = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.regNo) {
        const upper = value.toLocaleUpperCase().trim()
        setState({ regNo: upper, mode: 'autofetch' })
      }
    },
    [state.regNo]
  )

  useEffect(() => {
    if (state.regNo !== reg.dog?.regNo ?? '') {
      if ((validRegNo && state.mode === 'autofetch') || state.regNo === '') {
        buttonClick()
      }
    }
  }, [buttonClick, reg.dog?.regNo, state.mode, state.regNo, validRegNo])

  return (
    <CollapsibleSection
      title={t('registration.dog')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <FormHelperText error={state.mode === 'notfound'} sx={{ display: 'none', minHeight: { xs: 40, sm: 20 } }}>
        {t(`registration.cta.helper.${state.mode}`, { date: reg?.dog?.refreshDate })}
      </FormHelperText>
      <Grid container spacing={1} alignItems="center">
        <Grid item xs={8} sm={4} lg={2}>
          <Autocomplete
            id="txtReknro"
            disabled={!disabled}
            freeSolo
            renderInput={(props) => <TextField {...props} error={!validRegNo} label={t('dog.regNo')} />}
            value={state.regNo}
            inputValue={state.regNo}
            onChange={handleRegNoSelect}
            onInputChange={handleRegNoChange}
            options={cachedRegNos ?? []}
          />
        </Grid>
        <Grid item xs={4} sm={2} lg={1}>
          <LoadingButton
            disabled={!validRegNo || (state.mode === 'update' && !allowRefresh)}
            loading={loading}
            startIcon={<CachedOutlined />}
            size="small"
            variant="outlined"
            onClick={buttonClick}
          >
            {t(`registration.cta.${state.mode}`)}
          </LoadingButton>
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
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
        <Grid item container spacing={1} xs={12} lg={6}>
          <TitlesAndName
            className={disabled && reg?.dog?.breedCode ? 'fact' : ''}
            disabledTitles={disabled && state.mode !== 'update'}
            disabledName={disabled}
            id="dog"
            name={reg?.dog?.name}
            nameLabel={t('dog.name')}
            onChange={(props) => handleChange({ dog: props })}
            titles={reg?.dog?.titles}
            titlesLabel={t('dog.titles')}
          />
        </Grid>
        <Grid item xs={6} sm={3} lg={3}>
          <FormControl className={disabled && reg?.dog?.dob ? 'fact' : ''} fullWidth>
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
        <Grid item xs={6} sm={3} lg={3}>
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
        <Grid item xs={12} sm={6}>
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
        <Grid item spacing={1} xs={12} lg={6}>
          <TextField
            disabled={disabled && state.mode !== 'update'}
            fullWidth
            id={'sire'}
            label={t('dog.sire.name')}
            onChange={(e) => handleChange({ dog: { sire: { name: e.target.value } } })}
            value={reg?.dog?.sire?.name}
          />
        </Grid>
        <Grid item spacing={1} xs={12} lg={6}>
          <TextField
            disabled={disabled && state.mode !== 'update'}
            fullWidth
            id={'dam'}
            label={t('dog.dam.name')}
            onChange={(e) => handleChange({ dog: { dam: { name: e.target.value } } })}
            value={reg?.dog?.dam?.name}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
