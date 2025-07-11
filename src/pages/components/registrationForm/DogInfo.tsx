import type { SyntheticEvent } from 'react'
import type { BreedCode, DeepPartial, DogGender, Registration } from '../../../types'
import type { DogCachedInfo } from '../../recoil/dog'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'
import { useRecoilValue } from 'recoil'

import { emptyDog } from '../../../lib/data'
import { createDogUpdateFromFormValues, shouldAllowRefresh } from '../../../lib/dog'
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
    regNo: reg?.dog?.regNo ?? '',
    mode: reg?.dog?.regNo ? 'update' : 'fetch',
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
      rfid: reg?.dog?.rfid ?? '',
      name: reg?.dog?.name ?? '',
      titles: reg?.dog?.titles ?? '',
      dob: reg?.dog?.dob,
      gender: reg?.dog?.gender ?? '',
      breedCode: reg?.dog?.breedCode ?? '',
      sire: reg?.dog?.sire?.name ?? '',
      dam: reg?.dog?.dam?.name ?? '',
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
        setState({ regNo: '', mode: 'fetch', rfid: false })
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
      (reason) => {
        console.error(reason)
        setLoading(false)
      }
    )
  }, [delayed, handleDogOperation, loading, state.mode])

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
        </Grid2>

        <DogDetails
          formValues={formValues}
          updateField={updateField}
          disabledByMode={disabledByMode}
          rfidDisabled={rfidDisabled}
          sireDamDisabled={sireDamDisabled}
          disabled={disabled}
          mode={state.mode}
          reg={reg}
          eventDate={eventDate}
          minDogAgeMonths={minDogAgeMonths}
        />
      </Grid2>
    </CollapsibleSection>
  )
}
