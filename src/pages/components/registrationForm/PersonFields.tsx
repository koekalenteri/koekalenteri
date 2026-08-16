import type { DeepPartial, Person } from '../../../types'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { MuiTelInput } from 'mui-tel-input'
import { useTranslation } from 'react-i18next'
import { useLocalStateGroup } from './hooks/useLocalStateGroup'

interface PersonFieldValues {
  readonly email: string
  readonly location?: string
  readonly name: string
  readonly phone: string
}

interface Props {
  readonly disabled?: boolean
  readonly idPrefix: string
  readonly includeLocation?: boolean
  readonly onChange?: (values: PersonFieldValues) => void
  readonly person?: DeepPartial<Person>
}

export function PersonFields({ disabled, idPrefix, includeLocation = true, onChange, person }: Props) {
  const { t, i18n } = useTranslation()
  const [formValues, updateField] = useLocalStateGroup(
    {
      email: person?.email ?? '',
      ...(includeLocation ? { location: person?.location ?? '' } : {}),
      name: person?.name ?? '',
      phone: person?.phone ?? '',
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
      {includeLocation && (
        <Grid size={{ sm: 6, xs: 12 }}>
          <TextField
            disabled={disabled}
            error={!person?.location}
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
      <Grid size={{ sm: 6, xs: 12 }}>
        <TextField
          disabled={disabled}
          error={!person?.email}
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
      <Grid size={{ sm: 6, xs: 12 }}>
        <MuiTelInput
          langOfCountryName={i18n.language}
          defaultCountry="FI"
          forceCallingCode
          autoComplete="tel"
          disabled={disabled}
          error={!person?.phone}
          fullWidth
          id={`${idPrefix}_phone`}
          label={t('contact.phone')}
          name="phone"
          onChange={(value) => updateField('phone', value)}
          value={formValues.phone}
        />
      </Grid>
    </Grid>
  )
}
