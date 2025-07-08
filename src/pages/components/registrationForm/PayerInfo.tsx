import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'
import TextField from '@mui/material/TextField'
import { MuiTelInput } from 'mui-tel-input'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'
import { useLocalStateGroup } from './hooks/useLocalStateGroup'

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

export function PayerInfo({ reg, disabled, error, helperText, onChange, onOpenChange, open }: Props) {
  const { t, i18n } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'payer')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson>) => {
      const payer = setCache({ ...cache, ...props })
      onChange?.({ payer })
    },
    [cache, onChange, setCache]
  )

  // Group local state for all form fields with a single debounced update
  const [formValues, updateField] = useLocalStateGroup(
    {
      name: reg.payer?.name ?? '',
      email: reg.payer?.email ?? '',
      phone: reg.payer?.phone ?? '',
    },
    (values) => {
      // Handle all field updates as a group
      handleChange(values)
    }
  )

  return (
    <CollapsibleSection
      title={t('registration.payer')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Grid2 container spacing={1}>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.payer?.name}
            fullWidth
            id="payer_name"
            label={t('contact.name')}
            name="name"
            onChange={(e) => updateField('name', e.target.value)}
            value={formValues.name}
            slotProps={{
              input: { autoComplete: 'name' },
            }}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.payer?.email}
            fullWidth
            id="payer_email"
            label={t('contact.email')}
            name="email"
            onChange={(e) => updateField('email', e.target.value.trim())}
            value={formValues.email}
            slotProps={{
              input: { autoComplete: 'email' },
            }}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <MuiTelInput
            langOfCountryName={i18n.language}
            defaultCountry="FI"
            forceCallingCode
            autoComplete="tel"
            disabled={disabled}
            error={!reg.payer?.phone}
            fullWidth
            id="payer_phone"
            label={t('contact.phone')}
            name="phone"
            onChange={(value) => updateField('phone', value)}
            value={formValues.phone}
          />
        </Grid2>
      </Grid2>
    </CollapsibleSection>
  )
}
