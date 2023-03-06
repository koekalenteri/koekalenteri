import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, FormControlLabel, FormGroup, Grid, Switch, TextField } from '@mui/material'
import { DeepPartial, Registration, RegistrationPerson } from 'koekalenteri-shared/model'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'

interface Props {
  reg: DeepPartial<Registration>
  error?: boolean
  helperText?: string
  onChange: (props: DeepPartial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function OwnerInfo({ reg, error, helperText, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'owner')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson & { ownerHandles: boolean }>) => {
      const cached = setCache({ ...cache, ...props })
      if (cached) {
        const { ownerHandles, ...owner } = cached
        onChange({ owner, ownerHandles })
      }
    },
    [cache, onChange, setCache]
  )

  return (
    <CollapsibleSection
      title={t('registration.owner')}
      error={error}
      helperText={helperText}
      open={open && !!reg.dog?.regNo}
      onOpenChange={onOpenChange}
    >
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'name' }}
              error={!reg.owner?.name}
              fullWidth
              id="owner_name"
              label={t('contact.name')}
              name="name"
              onChange={(e) => handleChange({ name: e.target.value || '' })}
              value={reg.owner?.name || ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'address-level2' }}
              error={!reg.owner?.location}
              fullWidth
              id="owner_city"
              label={t('contact.city')}
              name="city"
              onChange={(e) => handleChange({ location: e.target.value || '' })}
              value={reg.owner?.location || ''}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'email' }}
              error={!reg.owner?.email}
              fullWidth
              id="owner_email"
              label={t('contact.email')}
              name="email"
              onChange={(e) => handleChange({ email: e.target.value || '' })}
              value={reg.owner?.email || ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'tel' }}
              error={!reg.owner?.phone}
              fullWidth
              id="owner_phone"
              label={t('contact.phone')}
              name="phone"
              onChange={(e) => handleChange({ phone: e.target.value || '' })}
              value={reg.owner?.phone || ''}
            />
          </Grid>
        </Grid>
      </Grid>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              checked={reg.owner?.membership ?? false}
              onChange={(e) => handleChange({ membership: e.target.checked })}
            />
          }
          label={t('registration.ownerIsMember')}
        />
      </FormGroup>
      <FormGroup>
        <FormControlLabel
          control={
            <Switch checked={reg.ownerHandles} onChange={(e) => handleChange({ ownerHandles: e.target.checked })} />
          }
          label={t('registration.ownerHandles')}
        />
      </FormGroup>
    </CollapsibleSection>
  )
}
