import type { DeepPartial, RegistrationOwner } from '../../../../types'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import { useTranslation } from 'react-i18next'
import { withDefaultOwnerSelection } from '../../../../lib/registration'

const SOMEONE_ELSE = ''

/**
 * Radio value for a `ownerHandles`/`ownerPays` selection: the selected owner's key or SOMEONE_ELSE.
 * An unset selection defaults to the (first) owner, matching createRegistrationDraft's default of true.
 */
export const ownerSelectionValue = (
  selection: boolean | string | undefined,
  owners: DeepPartial<RegistrationOwner>[]
): string => {
  if (typeof selection === 'string') return owners.some((owner) => owner.key === selection) ? selection : SOMEONE_ELSE
  return withDefaultOwnerSelection(selection) ? (owners[0]?.key ?? SOMEONE_ELSE) : SOMEONE_ELSE
}

interface Props {
  readonly disabled?: boolean
  readonly label: string
  readonly labelId: string
  readonly owners: DeepPartial<RegistrationOwner>[]
  readonly value: string
  readonly onChange: (value: string | false) => void
}

export default function OwnerSelect({ disabled, label, labelId, owners, value, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <FormControl disabled={disabled}>
      <FormLabel id={labelId}>{label}</FormLabel>
      <RadioGroup aria-labelledby={labelId} value={value} onChange={(e) => onChange(e.target.value || false)}>
        {owners.map((owner, index) => (
          <FormControlLabel
            key={owner.key}
            value={owner.key}
            control={<Radio />}
            label={owner.name || t('registration.ownerNumber', { number: index + 1 })}
          />
        ))}
        <FormControlLabel value={SOMEONE_ELSE} control={<Radio />} label={t('registration.someoneElse')} />
      </RadioGroup>
    </FormControl>
  )
}
