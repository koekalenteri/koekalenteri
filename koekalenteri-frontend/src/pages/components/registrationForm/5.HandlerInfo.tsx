import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { DeepPartial, Registration, RegistrationPerson } from 'koekalenteri-shared/model'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'

type HandlerInfoProps = {
  reg: DeepPartial<Registration>
  error?: boolean
  helperText?: string
  onChange: (props: DeepPartial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function HandlerInfo({ reg, error, helperText, onChange, onOpenChange, open }: HandlerInfoProps) {
  const { t } = useTranslation()
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
            <TextField
              InputProps={{ autoComplete: 'tel' }}
              error={!reg.handler?.phone}
              fullWidth
              id="handler_phone"
              label={t('contact.phone')}
              name="phone"
              onChange={(e) => handleChange({ phone: e.target.value ?? '' })}
              value={reg.handler?.phone ?? ''}
            />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel
        control={
          <Checkbox
            checked={reg.handler?.membership ?? false}
            onChange={(e) => handleChange({ membership: e.target.checked })}
          />
        }
        label={t('registration.handlerIsMember')}
      />
    </CollapsibleSection>
  )
}
