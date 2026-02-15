import type { SyntheticEvent } from 'react'
import type { BreedCode, DeepPartial, DogGender, Registration } from '../../../types'
import type { DogCachedInfo } from '../../recoil/dog'
import Grid from '@mui/material/Grid'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue } from 'recoil'
import { emptyDog } from '../../../lib/data'
import { createDogUpdateFromFormValues, isValidDob, shouldAllowRefresh } from '../../../lib/dog'
import { hasChanges } from '../../../lib/utils'
import { validateRegNo } from '../../../lib/validation'
import { useDogActions } from '../../recoil/dog'
import { cachedDogRegNumbersSelector } from '../../recoil/dog/selectors'
import CollapsibleSection from '../CollapsibleSection'
import { DogDetails } from './dogInfo/DogDetails'
import { DogSearch } from './dogInfo/DogSearch'
import { useLocalStateGroup } from './hooks/useLocalStateGroup'

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
  dob: boolean
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
  const [state, setState] = useState<State>({
    dob: false,
    mode: reg?.dog?.regNo ? 'update' : 'fetch',
    regNo: reg?.dog?.regNo ?? '',
    rfid: false,
  })

  // Group local state for all form fields with a single debounced update
  const [formValues, updateField] = useLocalStateGroup<{
    rfid: string
    name: string
    titles: string
    dob: Date | undefined
    gender: DogGender | ''
    breedCode: BreedCode | ''
    sire: string
    dam: string
  }>(
    {
      breedCode: reg?.dog?.breedCode ?? '',
      dam: reg?.dog?.dam?.name ?? '',
      dob: reg?.dog?.dob,
      gender: reg?.dog?.gender ?? '',
      name: reg?.dog?.name ?? '',
      rfid: reg?.dog?.rfid ?? '',
      sire: reg?.dog?.sire?.name ?? '',
      titles: reg?.dog?.titles ?? '',
    },
    (values) => {
      // Create a dog update object and send it
      const dogUpdate = createDogUpdateFromFormValues(values)
      handleChange({ dog: dogUpdate })
    }
  )

  // Derived state
  const disabledByMode = disabled || state.mode !== 'manual'
  const sireDamDisabled = disabledByMode && (disabled || state.mode !== 'update')
  const rfidDisabled = disabledByMode && (!state.rfid || state.mode === 'notfound')
  const dobDisabled = disabledByMode && (!state.dob || state.mode === 'notfound')
  const validRegNo = validateRegNo(state.regNo)
  const [loading, setLoading] = useState(false)
  const [delayed, setDelayed] = useState(false)
  const allowRefresh = shouldAllowRefresh(reg?.dog)
  const cachedRegNos = useRecoilValue(cachedDogRegNumbersSelector)
  const actions = useDogActions(state.regNo)

  const handleChange = useCallback(
    (props: DeepPartial<DogCachedInfo>) => {
      const cache = actions.updateCache({ ...props, manual: state.mode === 'manual' })
      onChange?.({ dog: cache.dog })
    },
    [actions, onChange, state.mode]
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

  const handleDogOperation = useCallback(
    async (mode: State['mode']) => {
      let delay = 100

      if (mode === 'autofetch' || mode === 'fetch') {
        try {
          const cache = await actions.fetch()
          updateDog(cache)
          if (state.regNo) {
            let newMode: State['mode'] = 'update'
            if (!cache?.dog?.regNo) newMode = 'notfound'
            if (cache?.manual) newMode = 'manual'

            setState((prev) => ({
              ...prev,
              dob: !isValidDob(cache?.dog?.dob),
              mode: newMode,
              rfid: !!cache.rfid || !cache?.dog?.rfid,
            }))
          }
        } catch (err) {
          console.error(err)
          updateDog({ dog: emptyDog })
          setState((prev) => ({ ...prev, mode: 'error' }))
        }
        delay = 500
      } else if (mode === 'update') {
        updateDog(await actions.refresh(reg.dog))
        delay = 500
      } else if (mode === 'notfound') {
        setState((prev) => ({ ...prev, mode: 'manual' }))
      } else {
        setState({ dob: false, mode: 'fetch', regNo: '', rfid: false })
      }

      return delay
    },
    [actions, reg.dog, state.regNo, updateDog]
  )

  const buttonClick = useCallback(() => {
    if (delayed || loading) {
      return
    }

    setLoading(true)
    setDelayed(true)

    handleDogOperation(state.mode).then(
      (delay) => {
        setLoading(false)
        setTimeout(() => setDelayed(false), delay)
      },
      (err) => {
        console.error(err)
        setLoading(false)
      }
    )
  }, [delayed, handleDogOperation, loading, state.mode])

  const handleRegNoChange = useCallback(
    (_event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.regNo) {
        const upper = value.toLocaleUpperCase().trim()
        setState({ dob: false, mode: 'fetch', regNo: upper, rfid: false })
      }
    },
    [state.regNo]
  )

  const handleRegNoSelect = useCallback(
    (_event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.regNo) {
        const upper = value.toLocaleUpperCase().trim()
        setState({ dob: false, mode: 'autofetch', regNo: upper, rfid: false })
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
      <Grid container spacing={1} alignItems="flex-start">
        <Grid size={{ lg: 3, md: 6, sm: 7, xs: 12 }}>
          <DogSearch
            regNo={state.regNo}
            disabled={disabled}
            disabledByMode={disabledByMode}
            validRegNo={validRegNo}
            allowRefresh={allowRefresh}
            mode={state.mode}
            loading={loading}
            cachedRegNos={cachedRegNos}
            refreshDate={reg?.dog?.refreshDate}
            onRegNoChange={handleRegNoChange}
            onRegNoSelect={handleRegNoSelect}
            onButtonClick={buttonClick}
          />
        </Grid>

        <DogDetails
          formValues={formValues}
          updateField={updateField}
          disabledByMode={disabledByMode}
          rfidDisabled={rfidDisabled}
          dobDisabled={dobDisabled}
          sireDamDisabled={sireDamDisabled}
          disabled={disabled}
          mode={state.mode}
          reg={reg}
          eventDate={eventDate}
          minDogAgeMonths={minDogAgeMonths}
        />
      </Grid>
    </CollapsibleSection>
  )
}
