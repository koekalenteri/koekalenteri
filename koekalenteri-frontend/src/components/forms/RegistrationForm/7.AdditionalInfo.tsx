import { TextField } from '@mui/material';
import { CollapsibleSection } from '../..';

export function AdditionalInfo() {
  return (
    <CollapsibleSection title="Lisätiedot">
      <TextField multiline rows={4} sx={{ width: '100%' }}></TextField>
    </CollapsibleSection>
  );
}
