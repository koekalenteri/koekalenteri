import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'

import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'
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

export function HandlerInfo({ admin, reg, disabled, error, helperText, onChange, onOpenChange, open, orgId }: Props) {
  const { t, i18n } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'handler')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson>) => {
      const membership =
        props.membership === undefined ? cache?.membership : { ...cache?.membership, [orgId]: props.membership }
      const cached = setCache({ ...cache, ...props, membership })
      if (cached) {
        onChange?.({ handler: { ...cached, membership: cached.membership?.[orgId] ?? false } })
      }
    },
    [cache, onChange, orgId, setCache]
  )

  useEffect(() => {
    // Don't change registrations based on cache when secretary handles them
    if (admin || reg.ownerHandles) return

    const cachedMembership = cache?.membership?.[orgId]
    if (cachedMembership !== undefined && reg.handler?.membership !== cachedMembership) {
      onChange?.({ handler: { ...reg.handler, membership: cachedMembership } })
    }
  }, [admin, cache, onChange, orgId, reg.handler, reg.ownerHandles])

  return (
    <CollapsibleSection
      title={t('registration.handler')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Grid2 container spacing={1}>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.handler?.name}
            fullWidth
            id="handler_name"
            label={t('contact.name')}
            name="name"
            onChange={(e) => handleChange({ name: e.target.value })}
            value={reg.handler?.name ?? ''}
            slotProps={{
              input: { autoComplete: 'name' },
            }}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.handler?.location}
            fullWidth
            id="handler_city"
            label={t('contact.city')}
            name="city"
            onChange={(e) => handleChange({ location: e.target.value })}
            value={reg.handler?.location ?? ''}
            slotProps={{
              input: { autoComplete: 'address-level2' },
            }}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.handler?.email}
            fullWidth
            id="handler_email"
            label={t('contact.email')}
            name="email"
            onChange={(e) => handleChange({ email: e.target.value.trim() })}
            value={reg.handler?.email ?? ''}
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
            error={!reg.handler?.phone}
            fullWidth
            id="handler_phone"
            label={t('contact.phone')}
            name="phone"
            onChange={(phone) => handleChange({ phone })}
            value={reg.handler?.phone ?? ''}
          />
        </Grid2>
      </Grid2>
    </CollapsibleSection>
  )
}
