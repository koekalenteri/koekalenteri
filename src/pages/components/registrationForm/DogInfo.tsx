import type { SyntheticEvent } from 'react'
import type { BreedCode, DayKey, DeepPartial, DogGender, Registration } from '@/types'
import type { DogCachedInfo } from '../../state/dog'
import Grid from '@mui/material/Grid'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { emptyDog } from '@/lib/data'
import { createDogUpdateFromFormValues, isValidDob, shouldAllowRefresh, typedDogFields } from '@/lib/dog'
import { stripOwnerKey, withDefaultOwnerSelection } from '@/lib/registration'
import { hasChanges } from '@/lib/utils'
import { regNoError, validateRegNo } from '@/lib/validation'
import { useDogActions } from '../../state/dog'
import { cachedDogRegNumbersAtom } from '../../state/dog/derivedAtoms'
import CollapsibleSection from '../CollapsibleSection'
import { DogDetails } from './dogInfo/DogDetails'
import { DogSearch } from './dogInfo/DogSearch'
import { useLocalStateGroup } from './hooks/useLocalStateGroup'

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly eventDate: DayKey
  readonly minDogAgeMonths: number
  readonly disabled?: boolean
  /** Only the details the user typed stay open: a secretary's fix after the trial (KOE-1650). */
  readonly typedDogOnly?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: DeepPartial<Registration>, replace?: boolean) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly orgId: string
}

interface State {
  /** The number as the field shows it, uppercased; a space typed at its end waits for the next key. */
  input: string
  mode: 'fetch' | 'manual' | 'update' | 'notfound' | 'autofetch' | 'error'
  dob: boolean
}

/**
 * The state the registration's own dog opens in, and returns to when its number is typed back (KOE-1651).
 * A bare regNo without dog data is a half-written draft (an interrupted fetch, a persisted admin draft):
 * starting it in 'update' would lock every field around an empty dog with the fetch CTA dead, so only a
 * dog that actually has data starts in 'update' (KOE-1269).
 */
const storedDogState = (dog: DeepPartial<Registration>['dog']): State => ({
  dob: !isValidDob(dog?.dob),
  input: dog?.regNo ?? '',
  mode: dog?.regNo && dog.name ? 'update' : 'fetch',
})

/**
 * The state for a number typed or picked from the list: a new number is looked up by `mode`, but the
 * stored number back again is the stored dog again, whichever way it came back (KOE-1651).
 */
const newNumberState = (dog: DeepPartial<Registration>['dog'], input: string, mode: 'fetch' | 'autofetch'): State =>
  input.trim() === dog?.regNo ? { ...storedDogState(dog), input } : { dob: false, input, mode }

export const DogInfo = ({
  reg,
  eventDate,
  minDogAgeMonths,
  disabled,
  typedDogOnly,
  error,
  helperText,
  onChange,
  onOpenChange,
  open,
  orgId,
}: Props) => {
  const { t } = useTranslation()
  const [state, setState] = useState<State>(() => storedDogState(reg?.dog))

  // Group local state for all form fields with a single debounced update
  const [formValues, updateField] = useLocalStateGroup<{
    rfid: string
    name: string
    titles: string
    dob: DayKey | undefined
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

  // Derived state. `typedDogOnly` leaves open only the details the user typed (KOE-1650).
  const locked = disabled || typedDogOnly
  const disabledByMode = locked || state.mode !== 'manual'
  const titlesDisabled = locked || (state.mode !== 'manual' && state.mode !== 'update')
  // The details the user types follow the dog, by the rule the validation reads too (`typedDogFields`),
  // so an error never lands on a locked field nor skips an open one (KOE-1650). They wait for the dog
  // the number names: none while it is being looked up or was not found.
  const typed = typedDogFields(reg?.dog)
  // The number is looked up, judged and stored without the edges of what was typed (KOE-1651).
  const regNo = state.input.trim()
  const regNoEdited = regNo !== reg?.dog?.regNo
  const typedLocked = disabled || !reg?.dog?.regNo || regNoEdited
  const rfidDisabled = typedLocked || !typed.rfid
  const detailsDisabled = typedLocked || !typed.details
  // Kennelliitto's dog without a birth date gets one typed too, but not after the trial: there only
  // the typed details open, by the rule `typedDogChange` takes them by.
  const dobDisabled = typedLocked || !(typed.details || (!typedDogOnly && state.dob))
  const validRegNo = validateRegNo(regNo)
  // A dog the registration holds that was typed by hand; a fresh entry or a number not found holds none.
  const holdsTypedDog = Boolean(reg?.dog?.name) && typed.details
  // A number Kennelliitto does not know becomes the user's to type, so it must be in its registry's
  // form; so must a typed dog's corrected number, as it is typed. The stored one is not judged (KOE-1651).
  const judgeRegNo = state.mode === 'notfound' || (holdsTypedDog && regNoEdited)
  const typedRegNoError = judgeRegNo ? regNoError(regNo) : undefined
  const [loading, setLoading] = useState(false)
  const [delayed, setDelayed] = useState(false)
  const allowRefresh = shouldAllowRefresh(reg?.dog)
  const cachedRegNos = useAtomValue(cachedDogRegNumbersAtom)
  const actions = useDogActions(regNo)

  const handleChange = useCallback(
    (props: DeepPartial<DogCachedInfo>) => {
      // An edit of a dog typed by hand keeps it cached as typed, also once it is stored (KOE-1651).
      const cache = actions.updateCache({ ...props, manual: state.mode === 'manual' || holdsTypedDog })
      onChange?.({ dog: cache.dog })
    },
    [actions, holdsTypedDog, onChange, state.mode]
  )

  const updateDog = useCallback(
    (cache?: DeepPartial<DogCachedInfo>) => {
      const dog = cache?.dog ?? {}
      const oldDog = reg?.dog ?? {}
      let replace = false
      if (hasChanges(oldDog, dog)) {
        const changes: DeepPartial<Registration> = { dog: cache?.dog }
        if (reg?.dog?.regNo !== cache?.dog?.regNo) {
          const owners = cache?.owner?.owners?.map(({ membership, ...owner }) => ({
            ...owner,
            membership: membership?.[orgId] ?? false,
          }))
          const [firstOwner] = owners ?? []
          // Only the name: a cache from before KOE-1264 may still hold the breeder's home town.
          changes.breeder = cache?.breeder && { name: cache.breeder.name }
          changes.handler = cache?.handler && { ...cache?.handler, membership: cache?.handler?.membership?.[orgId] }
          changes.owner = firstOwner && stripOwnerKey(firstOwner)
          changes.owners = owners
          changes.ownerHandles = withDefaultOwnerSelection(cache?.owner?.ownerHandles)
          changes.ownerPays = withDefaultOwnerSelection(cache?.owner?.ownerPays)
          changes.results = []
          replace = true
        }
        onChange?.(changes, replace)
      }
    },
    [onChange, orgId, reg?.dog]
  )

  /**
   * A dog typed by hand that Kennelliitto does not know by its corrected number stays as it was typed,
   * people and all; only the number changes, and the dog is cached under it as typed. It goes on as the
   * stored typed dog does, with its number open for another correction (KOE-1651).
   */
  const keepTypedDog = useCallback(() => {
    onChange?.({ dog: actions.updateCache({ dog: { ...reg.dog, regNo }, manual: true }).dog })
    setState((prev) => ({ ...prev, mode: 'update' }))
  }, [actions, onChange, reg.dog, regNo])

  const fetchDog = useCallback(
    async (mode: State['mode']) => {
      try {
        const cache = await actions.fetch()
        // A number typed back that is cached as typed is one Kennelliitto did not know either: the dog
        // held wins over an older cache of it. A number picked from the list asks for that dog.
        const typedBack = Boolean(cache?.manual) && mode !== 'autofetch'
        if (holdsTypedDog && (!cache?.dog?.regNo || typedBack)) {
          keepTypedDog()
          return
        }
        updateDog(cache)
        if (regNo) {
          let newMode: State['mode'] = 'update'
          if (!cache?.dog?.regNo) newMode = 'notfound'
          if (cache?.manual) newMode = 'manual'

          setState((prev) => ({
            ...prev,
            dob: !isValidDob(cache?.dog?.dob),
            mode: newMode,
            rfid: !!cache?.dog?.rfidEditable,
          }))
        }
      } catch (err) {
        console.error(err)
        // A failed lookup takes no dog typed by hand with it either (KOE-1651).
        if (!holdsTypedDog) updateDog({ dog: emptyDog })
        setState((prev) => ({ ...prev, mode: 'error' }))
      }
    },
    [actions, holdsTypedDog, keepTypedDog, regNo, updateDog]
  )

  const handleDogOperation = useCallback(
    async (mode: State['mode']) => {
      const delay = 100

      if (mode === 'autofetch' || mode === 'fetch') {
        await fetchDog(mode)
      } else if (mode === 'update') {
        updateDog(await actions.refresh(reg.dog))
      } else if (mode === 'notfound') {
        // Entering the dog by hand makes its chip the user's to type.
        onChange?.({ dog: actions.updateCache({ manual: true }).dog })
        setState((prev) => ({ ...prev, mode: 'manual' }))
      } else if (mode === 'error' && holdsTypedDog) {
        keepTypedDog()
      } else {
        // A new search starts from no dog. Emptying the number alone does not clear a dog typed by
        // hand, so the search clears it here (KOE-1651).
        updateDog({ dog: emptyDog })
        setState({ dob: false, input: '', mode: 'fetch' })
      }

      return delay
    },
    [actions, fetchDog, holdsTypedDog, keepTypedDog, onChange, reg.dog, updateDog]
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
      const input = value?.toLocaleUpperCase()
      if (input === undefined || input === state.input) return
      // Spaces inside a number are typed one key at a time ("LSVK LR 1234/19"), so the field keeps
      // them; only a change of the number itself starts a new search, and the stored number typed
      // back is the stored dog again.
      setState((prev) =>
        input.trim() === prev.input.trim() ? { ...prev, input } : newNumberState(reg?.dog, input, 'fetch')
      )
    },
    [reg?.dog, state.input]
  )

  const handleRegNoSelect = useCallback(
    (_event: SyntheticEvent<Element, Event>, value: string | null) => {
      if (value !== null && value !== state.input) {
        setState(newNumberState(reg?.dog, value.toLocaleUpperCase().trim(), 'autofetch'))
      }
    },
    [reg?.dog, state.input]
  )

  useEffect(() => {
    if (regNo !== (reg.dog?.regNo ?? '')) {
      if (document.visibilityState === 'hidden') {
        setState((prev) => ({ ...prev, input: reg.dog?.regNo ?? '' }))
        return
      }
      // An emptied number clears the dog, but not one typed by hand: its number is being corrected (KOE-1651).
      if ((validRegNo && state.mode === 'autofetch') || (regNo === '' && !holdsTypedDog)) {
        buttonClick()
      }
    }
  }, [buttonClick, holdsTypedDog, reg.dog?.regNo, state.mode, regNo, validRegNo])

  return (
    <CollapsibleSection
      title={t('registration.dog')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Grid
        container
        spacing={1}
        sx={{
          alignItems: 'flex-start',
        }}
      >
        <Grid size={{ lg: 3, md: 6, sm: 7, xs: 12 }}>
          <DogSearch
            regNo={state.input}
            disabled={locked}
            disabledByMode={disabledByMode}
            validRegNo={validRegNo}
            typedRegNoError={typedRegNoError}
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
          nameDisabled={locked || detailsDisabled}
          titlesDisabled={titlesDisabled}
          rfidDisabled={rfidDisabled}
          dobDisabled={dobDisabled}
          detailsDisabled={detailsDisabled}
          sireDamDisabled={titlesDisabled}
          reg={reg}
          eventDate={eventDate}
          minDogAgeMonths={minDogAgeMonths}
        />
      </Grid>
    </CollapsibleSection>
  )
}
