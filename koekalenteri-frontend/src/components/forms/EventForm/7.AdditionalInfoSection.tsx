import { TextField } from '@mui/material';
import { Event } from 'koekalenteri-shared/model';
import { CollapsibleSection, PartialEvent } from '../..';

export function AdditionalInfoSection({ event, onChange }: { event: PartialEvent; onChange: (props: Partial<Event>) => void; }) {
  return (
    <CollapsibleSection title="Lisätiedot">
      <TextField rows={5} fullWidth multiline value={event.description} onChange={(e) => onChange({ description: e.target.value })}></TextField>
    </CollapsibleSection>
  );
}
