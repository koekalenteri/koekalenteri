import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid, TextField } from '@mui/material'
import { Registration, RegistrationBreeder } from 'koekalenteri-shared/model'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'


type BreederInfoProps = {
  reg: Partial<Registration>
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function BreederInfo({ reg, error, helperText, onChange, onOpenChange, open }: BreederInfoProps) {
  const { t } = useTranslation()
  const [, setCache] = useDogCacheKey(reg.dog?.regNo, 'breeder')

  const handleChange = useCallback((props: Partial<RegistrationBreeder>) => {
    const breeder = setCache(props)
    onChange({ breeder })
  }, [onChange, setCache])

  return (
    <CollapsibleSection title={t('registration.breeder')} error={error} helperText={helperText} open={open} onOpenChange={onOpenChange}>
      <Grid item container spacing={1}>
        <Grid item>
          <TextField
            error={!reg.breeder?.name}
            id="breeder_name"
            sx={{ width: 300 }}
            label="Nimi"
            value={reg.breeder?.name ?? ''}
            onChange={e => handleChange({ name: e.target.value || '' })}
          />
        </Grid>
        <Grid item>
          <TextField
            error={!reg.breeder?.location}
            id="breeder_location"
            sx={{ width: 300 }}
            label="Kotikunta"
            value={reg.breeder?.location || ''}
            onChange={e => handleChange({ location: e.target.value || '' })}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
