import type { SyntheticEvent } from 'react'
import type { BreedCode, DeepPartial, Dog, DogGender, Registration } from '../../../types'
import type { DogCachedInfo } from '../../recoil/dog'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import Grid2 from '@mui/material/Grid2'
import TextField from '@mui/material/TextField'
import { Box } from '@mui/system'
import { DatePicker } from '@mui/x-date-pickers'
import { differenceInMinutes, subMonths, subYears } from 'date-fns'
import { useRecoilValue } from 'recoil'

import { hasChanges } from '../../../lib/utils'
import { useDogActions } from '../../recoil/dog'
import { cachedDogRegNumbersSelector } from '../../recoil/dog/selectors'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'
import { emptyDog } from '../RegistrationForm'

import { TitlesAndName } from './dogInfo/TitlesAndName'
import { validateRegNo } from './validation'

export function shouldAllowRefresh(dog?: DeepPartial<Dog>) {
  if (!dog?.regNo) {
    return false
  }
  if (dog.refreshDate && differenceInMinutes(new Date(), dog.refreshDate) <= 5) {
    return false
  }
  return !!dog.refreshDate
}

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly eventDate: Date
  readonly minDogAgeMonths: number
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: DeepPartial<Registration>, replace?: boolean) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly orgId: string
}

interface State {
  regNo: string
  mode: 'fetch' | 'manual' | 'update' | 'notfound' | 'autofetch' | 'error'
  rfid: boolean
}

export const DogInfo = ({
  reg,
  eventDate,
  minDogAgeMonths,
  disabled,
  error,
  helperText,
  onChange,
  onOpenChange,
  open,
  orgId,
}: Props) => {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const [state, setState] = useState<State>({
    regNo: reg?.dog?.regNo ?? '',
    mode: reg?.dog?.regNo ? 'update' : 'fetch',
    rfid: false,
  })
  const disabledByMode = disabled || state.mode !== 'manual'
  const sireDamDisabled = disabledByMode && (disabled || state.mode !== 'update')
  const rfidDisabled = disabledByMode && !state.rfid
  const validRegNo = validateRegNo(state.regNo)
  const [loading, setLoading] = useState(false)
  const [delayed, setDelayed] = useState(false)
  const allowRefresh = shouldAllowRefresh(reg?.dog)
  const cachedRegNos = useRecoilValue(cachedDogRegNumbersSelector)
  const actions = useDogActions(state.regNo)

  const handleChange = useCallback(
    (props: DeepPartial<DogCachedInfo>) => {
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
          const {
            ownerHandles,
            ownerPays,
            membership: ownerMembership,
            ...owner
          } = cache?.owner || { ownerHandles: true, ownerPays: true }
          changes.breeder = cache?.breeder
          changes.handler = cache?.handler && { ...cache?.handler, membership: cache?.handler?.membership?.[orgId] }
          changes.owner = cache?.owner && { ...owner, membership: ownerMembership?.[orgId] }
          changes.ownerHandles = ownerHandles
          changes.ownerPays = ownerPays
          changes.results = []
          replace = true
        }
        onChange?.(changes, replace)
      }
    },
    [onChange, orgId, reg?.dog]
  )

  const buttonClick = useCallback(() => {
    if (delayed || loading) {
      return
    }
    const load = async () => {
      let delay = 100
      switch (state.mode) {
        case 'autofetch':
        case 'fetch':
          try {
            const cache = await actions.fetch()
            updateDog(cache)
            if (state.regNo) {
              setState((prev) => ({
                ...prev,
                mode: cache?.dog?.regNo ? 'update' : 'notfound',
                rfid: !!cache.rfid || !cache?.dog?.rfid,
              }))
            }
          } catch (err) {
            updateDog(emptyDog)
            setState((prev) => ({ ...prev, mode: 'error' }))
          }
          delay = 500
          break
        case 'update':
          updateDog(await actions.refresh(reg.dog))
          delay = 500
          break
        case 'notfound':
          setState((prev) => ({ ...prev, mode: 'manual' }))
          break
        default:
          setState({ regNo: '', mode: 'fetch', rfid: false })
          break
      }
      return delay
    }
    setLoading(true)
    setDelayed(true)
    load().then(
      (delay) => {
        setLoading(false)
        setTimeout(() => setDelayed(false), delay)
      },
      (reason) => {
        console.error(reason)
        setLoading(false)
      }
    )
  }, [actions, delayed, loading, reg.dog, state.mode, state.regNo, updateDog])

  const handleRegNoChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.regNo) {
        const upper = value.toLocaleUpperCase().trim()
        setState({ regNo: upper, mode: 'fetch', rfid: false })
      }
    },
    [state.regNo]
  )
  const handleRegNoSelect = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.regNo) {
        const upper = value.toLocaleUpperCase().trim()
        setState({ regNo: upper, mode: 'autofetch', rfid: false })
      }
    },
    [state.regNo]
  )

  useEffect(() => {
    if (state.regNo !== (reg.dog?.regNo ?? '')) {
      if (document.visibilityState === 'hidden') {
        setState((prev) => ({ ...prev, regNo: reg.dog?.regNo ?? '' }))
        return
      }
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
      <Grid2 container spacing={1} alignItems="flex-start">
        <Grid2 size={{ xs: 12, sm: 7, md: 6, lg: 3 }}>
          <FormControl fullWidth>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Autocomplete
                id="txtReknro"
                disabled={disabled || !disabledByMode}
                freeSolo
                renderInput={(props) => <TextField {...props} error={!validRegNo} label={t('dog.regNo')} />}
                value={state.regNo}
                inputValue={state.regNo}
                onChange={handleRegNoSelect}
                onInputChange={handleRegNoChange}
                options={cachedRegNos ?? []}
                sx={{ display: 'flex', flexGrow: 1, mr: 1 }}
              />
              <Button
                disabled={disabled || !validRegNo || (state.mode === 'update' && !allowRefresh)}
                variant="contained"
                onClick={buttonClick}
              >
                {t(`registration.cta.${state.mode}`)}
              </Button>
              <CircularProgress size={28} sx={{ ml: 1, display: loading ? undefined : 'none' }} />
            </Box>
            <FormHelperText error={['notfound', 'error'].includes(state.mode)}>
              {t(`registration.cta.helper.${state.mode}`, { date: reg?.dog?.refreshDate })}
            </FormHelperText>
          </FormControl>
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 5, md: 6, lg: 3 }}>
          <TextField
            className={rfidDisabled && reg?.dog?.rfid ? 'fact' : ''}
            disabled={disabled || rfidDisabled}
            fullWidth
            label={t('dog.rfid')}
            value={reg?.dog?.rfid ?? ''}
            error={!rfidDisabled && !reg?.dog?.rfid}
            onChange={(e) => handleChange({ dog: { rfid: e.target.value } })}
          />
        </Grid2>
        <Grid2 container spacing={1} size={{ xs: 12, lg: 6 }}>
          <TitlesAndName
            className={disabledByMode && reg?.dog?.breedCode ? 'fact' : ''}
            disabledTitles={disabled || (disabledByMode && state.mode !== 'update')}
            disabledName={disabledByMode}
            id="dog"
            name={reg?.dog?.name}
            nameLabel={t('dog.name')}
            onChange={(props) => handleChange({ dog: props })}
            titles={reg?.dog?.titles}
            titlesLabel={t('dog.titles')}
          />
        </Grid2>
        <Grid2 size={{ xs: 6, sm: 3, lg: 3 }}>
          <FormControl className={disabledByMode && reg?.dog?.dob ? 'fact' : ''} fullWidth>
            <DatePicker
              referenceDate={subYears(new Date(), 2)}
              disabled={disabledByMode}
              format={t('dateFormatString.long')}
              label={t('dog.dob')}
              maxDate={subMonths(eventDate, minDogAgeMonths)}
              minDate={subYears(new Date(), 15)}
              onChange={(value: any) => value && handleChange({ dog: { dob: value } })}
              openTo={'year'}
              value={reg?.dog?.dob ?? null}
              views={['year', 'month', 'day']}
            />
          </FormControl>
        </Grid2>
        <Grid2 size={{ xs: 6, sm: 3, lg: 3 }}>
          <AutocompleteSingle<DogGender | '', true>
            className={disabledByMode && reg?.dog?.gender ? 'fact' : ''}
            disableClearable
            disabled={disabledByMode}
            error={!disabledByMode && !reg?.dog?.gender}
            getOptionLabel={(o) => (o ? t(`dog.genderChoises.${o}`) : '')}
            isOptionEqualToValue={(o, v) => o === v}
            label={t('dog.gender')}
            onChange={(value) => handleChange({ dog: { gender: value ? value : undefined } })}
            options={['F', 'M'] as DogGender[]}
            value={reg?.dog?.gender ?? ''}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <AutocompleteSingle<BreedCode | '', true>
            className={disabledByMode && reg?.dog?.breedCode ? 'fact' : ''}
            disableClearable
            disabled={disabledByMode}
            error={!disabledByMode && !reg?.dog?.breedCode}
            getOptionLabel={(o) => (o ? breed(o) : '')}
            isOptionEqualToValue={(o, v) => o === v}
            label={t('dog.breed')}
            onChange={(value) => handleChange({ dog: { breedCode: value ? value : undefined } })}
            options={['122', '111', '121', '312', '110', '263']}
            value={reg?.dog?.breedCode}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, lg: 6 }}>
          <TextField
            disabled={sireDamDisabled}
            fullWidth
            id={'sire'}
            label={t('dog.sire.name')}
            onChange={(e) => handleChange({ dog: { sire: { name: e.target.value } } })}
            error={!sireDamDisabled && !reg?.dog?.sire?.name}
            value={reg?.dog?.sire?.name ?? ''}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, lg: 6 }}>
          <TextField
            disabled={sireDamDisabled}
            fullWidth
            id={'dam'}
            label={t('dog.dam.name')}
            onChange={(e) => handleChange({ dog: { dam: { name: e.target.value } } })}
            error={!sireDamDisabled && !reg?.dog?.dam?.name}
            value={reg?.dog?.dam?.name ?? ''}
          />
        </Grid2>
      </Grid2>
    </CollapsibleSection>
  )
}
