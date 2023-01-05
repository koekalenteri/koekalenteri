import { useTranslation } from "react-i18next"
import { Grid } from "@mui/material"
import { ContactInfo } from "koekalenteri-shared/model"

import { CollapsibleSection } from "../../../../components"
import { SectionProps } from "../EventForm"

import { EventContactInfo } from "./contactInfoSection/EventContactInfo"
import PersonContactInfo from "./contactInfoSection/PersonContactInfo"

export default function ContactInfoSection({ event, helperTexts, onChange, onOpenChange, open }: SectionProps) {
  const { t } = useTranslation()
  const handleChange = (props: Partial<ContactInfo>) => onChange({ contactInfo: { ...(event.contactInfo || {}), ...props } })
  const helperText = helperTexts?.contactInfo || ''

  return (
    <CollapsibleSection title={t('event.contactInfo')} open={open} onOpenChange={onOpenChange} error={!!helperText} helperText={helperText}>
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <PersonContactInfo contact='official' show={event.contactInfo?.official} onChange={handleChange} />
          </Grid>
          <Grid item>
            <PersonContactInfo contact='secretary' show={event.contactInfo?.secretary} onChange={handleChange} />
          </Grid>
        </Grid>
      </Grid>
      <hr />
      <EventContactInfo event={event} />
    </CollapsibleSection>
  )
}


