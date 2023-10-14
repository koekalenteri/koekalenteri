import type { DeepPartial, Registration, RegistrationPerson } from 'koekalenteri-shared/model'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
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
  readonly onChange: (props: DeepPartial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

export function HandlerInfo({ reg, disabled, error, helperText, onChange, onOpenChange, open }: Props) {
  const { t, i18n } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'handler')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson>) => {
      const handler = setCache({ ...cache, ...props })
      onChange({ handler })
    },
    [cache, onChange, setCache]
  )

  return (
    <CollapsibleSection
      title={t('registration.handler')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'name' }}
              disabled={disabled}
              error={!reg.handler?.name}
              fullWidth
              id="handler_name"
              label={t('contact.name')}
              name="name"
              onChange={(e) => handleChange({ name: e.target.value || '' })}
              value={reg.handler?.name ?? ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'address-level2' }}
              disabled={disabled}
              error={!reg.handler?.location}
              fullWidth
              id="handler_city"
              label={t('contact.city')}
              name="city"
              onChange={(e) => handleChange({ location: e.target.value || '' })}
              value={reg.handler?.location ?? ''}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'email' }}
              disabled={disabled}
              error={!reg.handler?.email}
              fullWidth
              id="handler_email"
              label={t('contact.email')}
              name="email"
              onChange={(e) => handleChange({ email: e.target.value ?? '' })}
              value={reg.handler?.email ?? ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <MuiTelInput
              langOfCountryName={i18n.language}
              defaultCountry="FI"
              forceCallingCode
              InputProps={{ autoComplete: 'tel' }}
              disabled={disabled}
              error={!reg.handler?.phone}
              fullWidth
              id="handler_phone"
              label={t('contact.phone')}
              name="phone"
              onChange={(phone) => handleChange({ phone })}
              value={reg.handler?.phone ?? ''}
            />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel
        disabled={disabled}
        control={
          <Checkbox
            checked={reg.handler?.membership ?? false}
            onChange={(e) => handleChange({ membership: e.target.checked })}
          />
        }
        label={t('registration.handlerIsMember')}
        name="handlerIsMember"
      />
    </CollapsibleSection>
  )
}
