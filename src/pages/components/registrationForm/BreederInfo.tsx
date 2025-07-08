import type { DeepPartial, Registration, RegistrationBreeder } from '../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'
import TextField from '@mui/material/TextField'

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

export function BreederInfo({ reg, disabled, error, helperText, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'breeder')

  // Group local state for all form fields with a single debounced update
  const [formValues, updateField] = useLocalStateGroup(
    {
      name: reg.breeder?.name ?? '',
      location: reg.breeder?.location ?? '',
    },
    (values) => {
      // Handle all field updates as a group
      handleChange(values)
    }
  )

  const handleChange = useCallback(
    (props: Partial<RegistrationBreeder>) => {
      const breeder = setCache({ ...cache, ...props })
      onChange?.({ breeder })
    },
    [cache, onChange, setCache]
  )

  return (
    <CollapsibleSection
      title={t('registration.breeder')}
      error={error}
      helperText={helperText}
      open={open && !!reg.dog?.regNo}
      onOpenChange={onOpenChange}
    >
      <Grid2 container spacing={1}>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.breeder?.name}
            fullWidth
            id="breeder_name"
            label={t('contact.name')}
            value={formValues.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            disabled={disabled}
            error={!reg.breeder?.location}
            fullWidth
            id="breeder_location"
            label={t('contact.city')}
            value={formValues.location}
            onChange={(e) => updateField('location', e.target.value)}
          />
        </Grid2>
      </Grid2>
    </CollapsibleSection>
  )
}
