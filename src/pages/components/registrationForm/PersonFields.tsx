import type { DeepPartial, Person } from '../../../types'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { MuiTelInput } from 'mui-tel-input'
import { useTranslation } from 'react-i18next'
import { useLocalStateGroup } from './hooks/useLocalStateGroup'
import { hasEmailError, hasPhoneError } from './personValidation'

/** Contact details asked for beside the name, which is always asked for. */
export type PersonContactField = 'location' | 'email' | 'phone'

/**
 * Which contact details a person is asked for and which of them they must give. A field left out is
 * not rendered at all: the payer has no hometown, and a co-owner who neither handles nor pays is
 * only named (KOE-1351).
 */
export type PersonContactFields = Partial<Record<PersonContactField, 'required' | 'optional'>>

export const ALL_CONTACT_DETAILS_REQUIRED: PersonContactFields = {
  email: 'required',
  location: 'required',
  phone: 'required',
}

interface PersonFieldValues {
  readonly email?: string
  readonly location?: string
  readonly name: string
  readonly phone?: string
}

interface Props {
  readonly contactFields?: PersonContactFields
  readonly disabled?: boolean
  readonly idPrefix: string
  readonly onChange?: (values: PersonFieldValues) => void
  readonly person?: DeepPartial<Person>
}

export function PersonFields({
  contactFields = ALL_CONTACT_DETAILS_REQUIRED,
  disabled,
  idPrefix,
  onChange,
  person,
}: Props) {
  const { t, i18n } = useTranslation()
  const { email, location, phone } = contactFields
  const [formValues, updateField] = useLocalStateGroup<PersonFieldValues>(
    {
      ...(email ? { email: person?.email ?? '' } : {}),
      ...(location ? { location: person?.location ?? '' } : {}),
      name: person?.name ?? '',
      ...(phone ? { phone: person?.phone ?? '' } : {}),
    },
    onChange
  )

  return (
    <Grid container spacing={1}>
      <Grid size={{ sm: 6, xs: 12 }}>
        <TextField
          disabled={disabled}
          error={!person?.name}
          fullWidth
          id={`${idPrefix}_name`}
          label={t('contact.name')}
          name="name"
          onChange={(e) => updateField('name', e.target.value)}
          value={formValues.name}
          slotProps={{
            input: { autoComplete: 'name' },
          }}
        />
      </Grid>
      {location && (
        <Grid size={{ sm: 6, xs: 12 }}>
          <TextField
            disabled={disabled}
            error={location === 'required' && !person?.location}
            fullWidth
            id={`${idPrefix}_city`}
            label={t('contact.city')}
            name="city"
            onChange={(e) => updateField('location', e.target.value)}
            value={formValues.location}
            slotProps={{
              input: { autoComplete: 'address-level2' },
            }}
          />
        </Grid>
      )}
      {email && (
        <Grid size={{ sm: 6, xs: 12 }}>
          <TextField
            disabled={disabled}
            error={hasEmailError(person?.email, email === 'required')}
            fullWidth
            id={`${idPrefix}_email`}
            label={t('contact.email')}
            name="email"
            onChange={(e) => updateField('email', e.target.value.trim())}
            value={formValues.email}
            slotProps={{
              input: { autoComplete: 'email' },
            }}
          />
        </Grid>
      )}
      {phone && (
        <Grid size={{ sm: 6, xs: 12 }}>
          <MuiTelInput
            langOfCountryName={i18n.language}
            defaultCountry="FI"
            forceCallingCode
            autoComplete="tel"
            disabled={disabled}
            error={hasPhoneError(person?.phone, phone === 'required')}
            fullWidth
            id={`${idPrefix}_phone`}
            label={t('contact.phone')}
            name="phone"
            onChange={(value) => updateField('phone', value)}
            value={formValues.phone ?? ''}
          />
        </Grid>
      )}
    </Grid>
  )
}
