import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CachedOutlined } from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import { Autocomplete, FormControl, FormHelperText, Grid, Stack, TextField, TextFieldProps } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { differenceInMinutes, subMonths, subYears } from 'date-fns'
import { BreedCode, Dog, DogGender, Registration } from 'koekalenteri-shared/model'
import merge from 'lodash.merge'
import { useRecoilState, useRecoilValue } from 'recoil'

import { dogCacheAtom, DogCachedInfo } from '../../recoil/dog'
import { dogSelector } from '../../recoil/dog/selectors'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

import { validateRegNo } from './validation'

export function shouldAllowRefresh(dog?: Partial<Dog>) {
  if (!dog || !dog.regNo) {
    return false
  }
  if (dog.refreshDate && differenceInMinutes(new Date(), dog.refreshDate) <= 5) {
    return false
  }
  return !!dog.refreshDate
}

type DogInfoProps = {
  reg: Registration
  eventDate: Date
  minDogAgeMonths: number
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export const DogInfo = ({ reg, eventDate, minDogAgeMonths, error, helperText, onChange, onOpenChange, open }: DogInfoProps) => {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const [regNo, setRegNo] = useState<string>(reg.dog.regNo)
  const [inputRegNo, setInputRegNo] = useState<string>(reg.dog.regNo)
  const [mode, setMode] = useState<'fetch' | 'manual' | 'update' | 'invalid' | 'notfound'>('fetch')
  const allowRefresh = shouldAllowRefresh(reg.dog)
  const disabled = mode !== 'manual'
  const validRegNo = validateRegNo(inputRegNo)
  const [dog, setDog] = useRecoilState(dogSelector(validRegNo ? regNo : ''))
  const cachedDogs = useRecoilValue(dogCacheAtom)
  const handleChange = (props: Partial<Dog & DogCachedInfo>, replace?: boolean) => {
    setDog(merge({}, reg.dog, props))
    onChange({ dog })
  }

  const buttonClick = () => {
    switch (mode) {
      case 'fetch':
        setRegNo(regNo)
        break
      case 'update':
        // loadDog(regNo, true)
        break
      case 'notfound':
        setMode('manual')
        break
      default:
        setMode('fetch')
        break
    }
  }
  return (
    <CollapsibleSection title={t('registration.dog')} error={error} helperText={helperText} open={open} onOpenChange={onOpenChange}>
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <Autocomplete
          id="txtReknro"
          disabled={!disabled}
          freeSolo
          renderInput={(props) => <TextField {...props} error={!validRegNo} label={t('dog.regNo')} />}
          value={inputRegNo}
          onChange={(_e, value) => value && setInputRegNo(value.toUpperCase())}
          onInputChange={(e, value) => {
            setInputRegNo(value.toUpperCase())
          }}
          options={cachedDogs.filter?.(d => d.regNo).map(d => d.regNo)}
          sx={{ minWidth: 200 }}
        />
        <Stack alignItems="flex-start">
          <FormHelperText error={mode === 'notfound' || mode === 'invalid'}>{t(`registration.cta.helper.${mode}`, { date: reg.dog.refreshDate })}</FormHelperText>
          <LoadingButton
            disabled={!validRegNo || (mode === 'update' && !allowRefresh)}
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
            className={disabled && dog?.rfid ? 'fact' : ''}
            disabled={disabled}
            fullWidth
            label={t('dog.rfid')}
            value={dog?.rfid || ''}
            error={!disabled && !dog?.rfid}
            onChange={(e) => handleChange({ rfid: e.target.value })}
          />
        </Grid>
        <Grid item sx={{ width: 280 }}>
          <AutocompleteSingle<BreedCode | '', true>
            className={disabled && reg.dog.breedCode ? 'fact' : ''}
            disableClearable
            disabled={disabled}
            error={!disabled && !reg.dog.breedCode}
            getOptionLabel={(o) => o ? breed(o) : ''}
            isOptionEqualToValue={(o, v) => o === v}
            label={t('dog.breed')}
            onChange={(_e, value) => handleChange({ breedCode: value ? value : undefined })}
            options={['122', '111', '121', '312', '110', '263']}
            value={reg.dog.breedCode || ''}
          />
        </Grid>
        <Grid item xs={'auto'}>
          <FormControl sx={{ width: 146 }} className={disabled && reg.dog.dob ? 'fact' : ''}>
            <DatePicker
              defaultCalendarMonth={subYears(new Date(), 2)}
              disabled={disabled}
              inputFormat={t('dateformat')}
              label={t('dog.dob')}
              mask={t('datemask')}
              maxDate={subMonths(eventDate, minDogAgeMonths)}
              minDate={subYears(new Date(), 15)}
              onChange={(value: any) => value && handleChange({ dob: value })}
              openTo={'year'}
              renderInput={(params: JSX.IntrinsicAttributes & TextFieldProps) => <TextField {...params} />}
              value={reg.dog.dob || null}
              views={['year', 'month', 'day']}
            />
          </FormControl>
        </Grid>
        <Grid item xs={'auto'} sx={{ minWidth: 128 }}>
          <AutocompleteSingle<DogGender | '', true>
            className={disabled && reg.dog.gender ? 'fact' : ''}
            disableClearable
            disabled={disabled}
            error={!disabled && !reg.dog.gender}
            getOptionLabel={o => o ? t(`dog.gender_choises.${o}`) : ''}
            isOptionEqualToValue={(o, v) => o === v}
            label={t('dog.gender')}
            onChange={(_e, value) => handleChange({ gender: value ? value : undefined })}
            options={['F', 'M'] as DogGender[]}
            value={reg.dog.gender || ''}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            className={disabled && reg.dog.breedCode ? 'fact' : ''}
            disabledTitle={disabled && mode !== 'update'}
            disabledName={disabled}
            id="dog"
            name={reg.dog.name}
            nameLabel={t('dog.name')}
            onChange={props => handleChange(props)}
            titles={reg.dog.titles}
            titlesLabel={t('dog.titles')}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabledTitle={disabled && mode !== 'update'}
            disabledName={disabled && mode !== 'update'}
            id="sire"
            name={reg.dog.sire?.name}
            nameLabel={t('dog.sire.name')}
            onChange={props => handleChange({ sire: props })}
            titles={reg.dog.sire?.titles}
            titlesLabel={t('dog.sire.titles')}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabledTitle={disabled && mode !== 'update'}
            disabledName={disabled && mode !== 'update'}
            id="dam"
            name={reg.dog.dam?.name}
            nameLabel={t('dog.dam.name')}
            onChange={props => handleChange({ dam: props })}
            titles={reg.dog.dam?.titles}
            titlesLabel={t('dog.dam.titles')}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}

type TitlesAndNameProps = {
  className?: string
  disabledName: boolean
  disabledTitle: boolean
  id: string
  name?: string
  nameLabel: string
  onChange: (props: { titles?: string, name?: string }) => void
  titles?: string
  titlesLabel: string
}
function TitlesAndName(props: TitlesAndNameProps) {
  return (
    <Grid item container spacing={1}>
      <Grid item>
        <TextField
          className={props.className}
          disabled={props.disabledTitle}
          id={`${props.id}_titles`}
          label={props.titlesLabel}
          onChange={(e) => props.onChange({ titles: e.target.value })}
          sx={{ width: 300 }}
          value={props.titles || ''}
        />
      </Grid>
      <Grid item>
        <TextField
          className={props.className}
          disabled={props.disabledName}
          error={!props.disabledName && !props.name}
          id={`${props.id}_name`}
          label={props.nameLabel}
          onChange={(e) => props.onChange({ name: e.target.value })}
          sx={{ width: 300 }}
          value={props.name || ''}
        />
      </Grid>
    </Grid>
  )
}
