import type { ChangeEvent } from 'react'
import type { Headquarters } from '../../../../types'
import type { SectionProps } from '../EventForm'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'

import CollapsibleSection from '../../../components/CollapsibleSection'

interface Props extends Readonly<Omit<SectionProps, 'event'>> {
  readonly headquarters?: Partial<Headquarters>
}

export default function HeadquartersSection({
  headquarters,
  disabled,
  onChange,
  onOpenChange,
  open,
  errorStates,
  helperTexts,
}: Props) {
  const { t } = useTranslation()
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, props: Partial<Headquarters>) => {
      e.preventDefault()
      onChange?.({ headquarters: { ...props } })
    },
    [onChange]
  )
  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => handleChange(e, { name: e.target.value }),
    [handleChange]
  )
  const handleAddressChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => handleChange(e, { address: e.target.value }),
    [handleChange]
  )
  const handleZipCodeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => handleChange(e, { zipCode: e.target.value }),
    [handleChange]
  )
  const handleDistrictChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => handleChange(e, { postalDistrict: e.target.value }),
    [handleChange]
  )

  return (
    <CollapsibleSection
      title={t('event.headquarters.title')}
      open={open}
      onOpenChange={onOpenChange}
      error={errorStates?.headquarters}
      helperText={helperTexts?.headquarters}
    >
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              disabled={disabled}
              label={t('event.headquarters.name')}
              defaultValue={headquarters?.name ?? ''}
              onChange={handleNameChange}
              fullWidth
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              disabled={disabled}
              label={t('event.headquarters.address')}
              defaultValue={headquarters?.address ?? ''}
              onChange={handleAddressChange}
              fullWidth
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              disabled={disabled}
              label={t('event.headquarters.zipCode')}
              defaultValue={headquarters?.zipCode ?? ''}
              onChange={handleZipCodeChange}
              fullWidth
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              disabled={disabled}
              label={t('event.headquarters.postalDistrict')}
              defaultValue={headquarters?.postalDistrict ?? ''}
              onChange={handleDistrictChange}
              fullWidth
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
