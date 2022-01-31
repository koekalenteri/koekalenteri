import { TextField } from '@mui/material';
import { Event } from 'koekalenteri-shared/model';
import { CollapsibleSection } from './CollapsibleSection';

export function EventFormAdditionalInfo({ event, onChange }: { event: Partial<Event>; onChange: (props: Partial<Event>) => void; }) {
  return (
    <CollapsibleSection title="Lisätiedot">
      <TextField rows={5} fullWidth multiline value={event.description} onChange={(e) => onChange({ description: e.target.value })}></TextField>
    </CollapsibleSection>
  );
}
