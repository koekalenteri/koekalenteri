import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'

import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Grid2 from '@mui/material/Grid2'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { MuiTelInput } from 'mui-tel-input'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'

interface Props {
  readonly admin?: boolean
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly orgId: string
}

export function OwnerInfo({ admin, reg, disabled, error, helperText, onChange, onOpenChange, open, orgId }: Props) {
  const { t, i18n } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'owner')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson & { ownerHandles: boolean; ownerPays: boolean }>) => {
      const membership =
        props.membership === undefined ? cache?.membership : { ...cache?.membership, [orgId]: props.membership }
      const cached = setCache({ ...cache, ...props, membership })

      if (cached) {
        const { ownerHandles, ownerPays, ...owner } = cached
        onChange?.({
          owner: { ...owner, membership: owner.membership?.[orgId] ?? false },
          ownerHandles: ownerHandles ?? props.ownerHandles ?? true,
          ownerPays: ownerPays ?? props.ownerPays ?? true,
        })
      }
    },
    [cache, onChange, orgId, setCache]
  )

  useEffect(() => {
    // Don't change registrations based on cache when secretary handles them
    if (admin) return

    const cachedMembership = cache?.membership?.[orgId]
    if (cachedMembership !== undefined && reg.owner?.membership !== cachedMembership) {
      onChange?.({ owner: { ...reg.owner, membership: cachedMembership } })
    }
  }, [admin, cache, onChange, orgId, reg.owner])

  return (
    <CollapsibleSection
      title={t('registration.owner')}
      error={error}
      helperText={helperText}
      open={open && !!reg.dog?.regNo}
      onOpenChange={onOpenChange}
    >
      <Grid2 container spacing={1}>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.owner?.name}
            fullWidth
            id="owner_name"
            label={t('contact.name')}
            name="name"
            onChange={(e) => handleChange({ name: e.target.value })}
            value={reg.owner?.name ?? ''}
            slotProps={{
              input: { autoComplete: 'name' },
            }}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.owner?.location}
            fullWidth
            id="owner_city"
            label={t('contact.city')}
            name="city"
            onChange={(e) => handleChange({ location: e.target.value })}
            value={reg.owner?.location ?? ''}
            slotProps={{
              input: { autoComplete: 'address-level2' },
            }}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.owner?.email}
            fullWidth
            id="owner_email"
            label={t('contact.email')}
            name="email"
            onChange={(e) => handleChange({ email: e.target.value.trim() })}
            value={reg.owner?.email ?? ''}
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
            InputProps={{ autoComplete: 'tel' }}
            disabled={disabled}
            error={!reg.owner?.phone}
            fullWidth
            id="owner_phone"
            label={t('contact.phone')}
            name="phone"
            onChange={(phone) => handleChange({ phone })}
            value={reg.owner?.phone ?? ''}
          />
        </Grid2>
      </Grid2>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={reg.owner?.membership ?? false}
              onChange={(e) => handleChange({ membership: e.target.checked })}
            />
          }
          label={t('registration.ownerIsMember')}
          name="ownerIsMember"
        />
      </FormGroup>
      <FormGroup>
        <FormControlLabel
          disabled={disabled}
          control={
            <Switch
              checked={reg.ownerHandles ?? true}
              onChange={(e) => handleChange({ ownerHandles: e.target.checked })}
            />
          }
          label={t('registration.ownerHandles')}
          name="ownerHandles"
        />
        <FormControlLabel
          disabled={disabled}
          control={
            <Switch checked={reg.ownerPays ?? true} onChange={(e) => handleChange({ ownerPays: e.target.checked })} />
          }
          label={t('registration.ownerPays')}
          name="ownerPays"
        />
      </FormGroup>
    </CollapsibleSection>
  )
}
