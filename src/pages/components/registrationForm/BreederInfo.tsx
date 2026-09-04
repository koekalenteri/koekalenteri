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
  const [, setCache] = useDogCacheKey(reg.dog?.regNo, 'breeder')

  const handleChange = useCallback(
    ({ name }: RegistrationBreeder) => {
      // Only the name is written: a cache from before KOE-1264 may still hold the breeder's home
      // town, and it leaves the cache with the first edit.
      const breeder = setCache({ name })
      onChange?.({ breeder })
    },
    [onChange, setCache]
  )

  const [formValues, updateField] = useLocalStateGroup({ name: reg.breeder?.name ?? '' }, handleChange)

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
      </Grid>
    </CollapsibleSection>
  )
}
