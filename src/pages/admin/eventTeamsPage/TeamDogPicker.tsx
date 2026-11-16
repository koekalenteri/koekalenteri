import type { Registration } from '@/types'
import { useTranslation } from 'react-i18next'
import { findTeamCandidates } from '@/lib/client/teamAssembly'
import { getHandlingPerson } from '@/lib/registration'
import AutocompleteSingle from '../../components/AutocompleteSingle'

interface Props {
  /** The entries a team may take: candidates (`isTeamCandidate`, KOE-1725) in no team yet. */
  readonly available: readonly Registration[]
  readonly label: string
  readonly helperText?: string
  readonly disabled?: boolean
  /**
   * Changes after each pick, so the field is a new input, empty for the next dog: the number of dogs in
   * the team, or of teams for a new one.
   */
  readonly resetKey: number
  readonly onPick: (registration: Registration) => void
}

export const dogLabel = (registration: Registration) => registration.dog.name ?? registration.dog.regNo ?? ''

/** What a dog to add is found by (KOE-1725): its name and number, its handler, its published start number. */
const searchOf = (registration: Registration) => ({
  dogName: registration.dog.name,
  handler: getHandlingPerson(registration)?.name,
  regNo: registration.dog.regNo,
  startNumber: registration.startGroup?.number,
})

/**
 * The choice of a dog for a team (KOE-1725), found by its name, number, handler or start number: a dog
 * added to a team's card, or the first dog of a new team (KOE-1763).
 */
export default function TeamDogPicker({ available, label, helperText, disabled, resetKey, onPick }: Props) {
  const { t } = useTranslation()

  return (
    <AutocompleteSingle<Registration, false>
      key={resetKey}
      blurOnSelect
      disabled={disabled}
      filterOptions={(options, { inputValue }) => findTeamCandidates(options, inputValue, searchOf)}
      getOptionLabel={(registration) => {
        const { handler, startNumber } = searchOf(registration)
        const dog = startNumber === undefined ? dogLabel(registration) : `${startNumber} ${dogLabel(registration)}`
        return handler ? `${dog}, ${t('teams.handler', { name: handler })}` : dog
      }}
      getOptionKey={(registration) => registration.id}
      helperText={helperText}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      label={label}
      onChange={(registration) => {
        if (registration) onPick(registration)
      }}
      options={available}
      size="small"
      value={null}
    />
  )
}
