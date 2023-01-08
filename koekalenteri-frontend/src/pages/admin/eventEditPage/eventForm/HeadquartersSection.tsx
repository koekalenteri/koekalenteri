import { ChangeEvent, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Grid, TextField } from "@mui/material"
import { Headquarters } from "koekalenteri-shared/model"

import { CollapsibleSection } from "../../../../components/CollapsibleSection"
import { SectionProps } from "../EventForm"

interface Props extends Omit<SectionProps, 'event'> {
  headquarters?: Partial<Headquarters>
}

export default function HeadquartersSection({ headquarters, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>, props: Partial<Headquarters>) => {
    e.preventDefault()
    onChange({ headquarters: {...props} })
  }, [onChange])
  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => handleChange(e, { name: e.target.value }), [handleChange])
  const handleAddressChange = useCallback((e: ChangeEvent<HTMLInputElement>) => handleChange(e, { address: e.target.value }), [handleChange])
  const handleZipCodeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => handleChange(e, { zipCode: e.target.value }), [handleChange])
  const handleDistrictChange = useCallback((e: ChangeEvent<HTMLInputElement>) => handleChange(e, { postalDistrict: e.target.value }), [handleChange])


  return (
    <CollapsibleSection title={t('event.headquarters.title')} open={open} onOpenChange={onOpenChange}>
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{width: 300}}>
            <TextField label={t('event.headquarters.name')} defaultValue={headquarters?.name || ''} onChange={handleNameChange} fullWidth />
          </Grid>
          <Grid item sx={{width: 300}}>
            <TextField label={t('event.headquarters.address')} defaultValue={headquarters?.address || ''} onChange={handleAddressChange} fullWidth />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{width: 300}}>
            <TextField label={t('event.headquarters.zipCode')} defaultValue={headquarters?.zipCode || ''} onChange={handleZipCodeChange} fullWidth />
          </Grid>
          <Grid item sx={{width: 300}}>
            <TextField label={t('event.headquarters.postalDistrict')} defaultValue={headquarters?.postalDistrict || ''} onChange={handleDistrictChange} fullWidth />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
