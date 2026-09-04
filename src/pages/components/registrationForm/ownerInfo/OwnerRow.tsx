import type { OwnerRole } from '../../../../lib/registration'
import type { DeepPartial, RegistrationOwner } from '../../../../types'
import type { PersonContactFields } from '../PersonFields'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ALL_CONTACT_DETAILS_REQUIRED, PersonFields } from '../PersonFields'

/** The paying owner is billed and receives the receipt; their hometown is asked for but optional. */
const PAYER_CONTACT_DETAILS: PersonContactFields = { email: 'required', location: 'optional', phone: 'required' }

/** A co-owner who neither handles nor pays may give contact details, but nothing is required. */
const OPTIONAL_CONTACT_DETAILS: PersonContactFields = { email: 'optional', location: 'optional', phone: 'optional' }

/** Only the name, for a co-owner who has volunteered nothing else. */
const NAME_ONLY: PersonContactFields = {}

/** Empty strings, not missing keys, are how the form stores a contact detail nobody has given. */
const hasContactDetails = (owner: DeepPartial<RegistrationOwner>): boolean =>
  Boolean(owner.email || owner.location || owner.phone)

/**
 * What this owner is asked for. The handler and the payer are reached by the organizer, so they give
 * the details that job needs; a co-owner is only named until they choose to say more, and details
 * already on file always stay visible so nothing is edited out of sight (KOE-1351).
 */
const contactFieldsFor = (
  role: OwnerRole,
  owner: DeepPartial<RegistrationOwner>,
  expanded: boolean
): PersonContactFields => {
  if (role === 'handles') return ALL_CONTACT_DETAILS_REQUIRED
  if (role === 'pays') return PAYER_CONTACT_DETAILS
  if (expanded || hasContactDetails(owner)) return OPTIONAL_CONTACT_DETAILS
  return NAME_ONLY
}

interface Props {
  readonly disabled?: boolean
  readonly idPrefix: string
  readonly owner: DeepPartial<RegistrationOwner>
  readonly removable?: boolean
  readonly role: OwnerRole
  readonly onChange: (props: DeepPartial<Omit<RegistrationOwner, 'key'>>) => void
  readonly onRemove: () => void
}

export default function OwnerRow({ disabled, idPrefix, owner, removable, role, onChange, onRemove }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const contactFields = contactFieldsFor(role, owner, expanded)
  const canAddContactDetails = !disabled && Object.keys(contactFields).length === 0

  return (
    <Stack spacing={1}>
      <PersonFields
        contactFields={contactFields}
        disabled={disabled}
        idPrefix={idPrefix}
        onChange={onChange}
        person={owner}
      />
      {(canAddContactDetails || removable) && (
        <Stack direction="row" spacing={1}>
          {canAddContactDetails && (
            <Button onClick={() => setExpanded(true)} size="small" startIcon={<PersonAddAltOutlined />}>
              {t('registration.cta.addOwnerContact')}
            </Button>
          )}
          {removable && (
            <Button
              disabled={disabled}
              startIcon={<DeleteOutline />}
              onClick={onRemove}
              variant="outlined"
              sx={{ ml: 'auto' }}
            >
              {t('registration.cta.deleteOwner')}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  )
}
