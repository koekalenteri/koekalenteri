import type { DeepPartial, RegistrationOwner } from '../../../../types'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
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

  return (
    <Stack spacing={1}>
      <PersonFields disabled={disabled} idPrefix={idPrefix} onChange={onChange} person={owner} />
      {removable && (
        <Button
          disabled={disabled}
          startIcon={<DeleteOutline />}
          onClick={onRemove}
          variant="outlined"
          sx={{ alignSelf: 'flex-end' }}
        >
          {t('registration.cta.deleteOwner')}
        </Button>
      )}
    </Stack>
  )
}
