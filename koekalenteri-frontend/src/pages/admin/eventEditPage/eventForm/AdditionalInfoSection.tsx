import { TextField } from '@mui/material'

import { CollapsibleSection } from '../../../../components'
import { SectionProps } from '../EventForm'


export default function AdditionalInfoSection({ event, onChange, onOpenChange, open }: SectionProps) {
  return (
    <CollapsibleSection title="Lisätiedot" open={open} onOpenChange={onOpenChange}>
      <TextField rows={5} fullWidth multiline value={event.description} onChange={(e) => onChange({ description: e.target.value })}></TextField>
    </CollapsibleSection>
  )
}
