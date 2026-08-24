import type { DeepPartial, RegistrationOwner } from '../../../../types'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonFields } from '../PersonFields'

interface Props {
  readonly disabled?: boolean
  readonly idPrefix: string
  readonly owner: DeepPartial<RegistrationOwner>
  readonly removable?: boolean
  readonly onChange: (props: DeepPartial<Omit<RegistrationOwner, 'key'>>) => void
  readonly onRemove: () => void
}

export default function OwnerRow({ disabled, idPrefix, owner, removable, onChange, onRemove }: Props) {
  const { t } = useTranslation()

  const handleMembershipChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ membership: e.target.checked }),
    [onChange]
  )

  return (
    <Stack spacing={1}>
      <PersonFields disabled={disabled} idPrefix={idPrefix} onChange={onChange} person={owner} />
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FormControlLabel
          disabled={disabled}
          control={<Checkbox checked={!!owner.membership} onChange={handleMembershipChange} />}
          label={t('registration.ownerIsMember')}
          name={`${idPrefix}_membership`}
        />
        {removable && (
          <Button disabled={disabled} startIcon={<DeleteOutline />} onClick={onRemove} variant="outlined">
            {t('registration.cta.deleteOwner')}
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
