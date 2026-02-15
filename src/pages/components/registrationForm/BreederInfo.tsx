import type { DeepPartial, Registration, RegistrationBreeder } from '../../../types'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
      location: reg.breeder?.location ?? '',
      name: reg.breeder?.name ?? '',
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
      <Grid container spacing={1}>
        <Grid size={{ sm: 6, xs: 12 }}>
          <TextField
            disabled={disabled}
            error={!reg.breeder?.name}
            fullWidth
            id="breeder_name"
            label={t('contact.name')}
            value={formValues.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
        </Grid>
        <Grid size={{ sm: 6, xs: 12 }}>
          <TextField
            disabled={disabled}
            error={!reg.breeder?.location}
            fullWidth
            id="breeder_location"
            label={t('contact.city')}
            value={formValues.location}
            onChange={(e) => updateField('location', e.target.value)}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
