import { TextField } from '@mui/material';
import { Event } from 'koekalenteri-shared/model';
import { CollapsibleSection, PartialEvent } from '../..';

type AdditionalInfoSectionProps = {
  event: PartialEvent
  onChange: (props: Partial<Event>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}
export function AdditionalInfoSection({ event, onChange, onOpenChange, open }: AdditionalInfoSectionProps) {
  return (
    <CollapsibleSection title="Lisätiedot" open={open} onOpenChange={onOpenChange}>
      <TextField rows={5} fullWidth multiline value={event.description} onChange={(e) => onChange({ description: e.target.value })}></TextField>
    </CollapsibleSection>
  );
}
