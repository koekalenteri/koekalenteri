import type { DeepPartial, Registration, RegistrationBreeder } from 'koekalenteri-shared/model'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'

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

export function BreederInfo({ reg, disabled, error, helperText, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'breeder')

  const handleChange = useCallback(
    (props: Partial<RegistrationBreeder>) => {
      const breeder = setCache({ ...cache, ...props })
      onChange({ breeder })
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
      <Grid item container spacing={1}>
        <Grid item xs={12} sm={6}>
          <TextField
            disabled={disabled}
            error={!reg.breeder?.name}
            fullWidth
            id="breeder_name"
            label="Nimi"
            value={reg.breeder?.name ?? ''}
            onChange={(e) => handleChange({ name: e.target.value ?? '' })}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            disabled={disabled}
            error={!reg.breeder?.location}
            fullWidth
            id="breeder_location"
            label="Kotikunta"
            value={reg.breeder?.location ?? ''}
            onChange={(e) => handleChange({ location: e.target.value ?? '' })}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
