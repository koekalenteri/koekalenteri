import { Grid, TextField } from '@mui/material';
import { CollapsibleSection } from '../..';

export function BreederInfo() {
  return (
    <CollapsibleSection title="Kasvattajan tiedot">
      <Grid item container spacing={1}>
        <Grid item>
          <TextField name="name" sx={{ width: 300 }} label="Nimi" />
        </Grid>
        <Grid item>
          <TextField name="city" sx={{ width: 300 }} label="Postitoimipaikka" />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
