import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { MuiTelInput } from 'mui-tel-input'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'

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

  return (
    <CollapsibleSection
      title={t('registration.payer')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Grid item container spacing={1}>
        <Grid item xs={12} sm={6}>
          <TextField
            InputProps={{ autoComplete: 'name' }}
            disabled={disabled}
            error={!reg.payer?.name}
            fullWidth
            id="payer_name"
            label={t('contact.name')}
            name="name"
            onChange={(e) => handleChange({ name: e.target.value })}
            value={reg.payer?.name ?? ''}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            InputProps={{ autoComplete: 'email' }}
            disabled={disabled}
            error={!reg.payer?.email}
            fullWidth
            id="payer_email"
            label={t('contact.email')}
            name="email"
            onChange={(e) => handleChange({ email: e.target.value.trim() })}
            value={reg.payer?.email ?? ''}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <MuiTelInput
            langOfCountryName={i18n.language}
            defaultCountry="FI"
            forceCallingCode
            InputProps={{ autoComplete: 'tel' }}
            disabled={disabled}
            error={!reg.payer?.phone}
            fullWidth
            id="payer_phone"
            label={t('contact.phone')}
            name="phone"
            onChange={(phone) => handleChange({ phone })}
            value={reg.payer?.phone ?? ''}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
