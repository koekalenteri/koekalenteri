import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid, TextField } from '@mui/material'
import { DeepPartial, Registration, RegistrationBreeder } from 'koekalenteri-shared/model'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'

type BreederInfoProps = {
  reg: DeepPartial<Registration>
  error?: boolean
  helperText?: string
  onChange: (props: DeepPartial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function BreederInfo({ reg, error, helperText, onChange, onOpenChange, open }: BreederInfoProps) {
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
            error={!reg.breeder?.name}
            fullWidth
            id="breeder_name"
            label="Nimi"
            value={reg.breeder?.name ?? ''}
            onChange={(e) => handleChange({ name: e.target.value || '' })}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            error={!reg.breeder?.location}
            fullWidth
            id="breeder_location"
            label="Kotikunta"
            value={reg.breeder?.location || ''}
            onChange={(e) => handleChange({ location: e.target.value || '' })}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
