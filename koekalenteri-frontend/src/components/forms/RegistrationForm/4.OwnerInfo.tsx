import { Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { Registration } from 'koekalenteri-shared/model';
import { CollapsibleSection } from '../..';

type OwnerInfoProps = {
  reg: Registration
  onChange: (props: Partial<Registration>) => void
};

export function OwnerInfo({reg, onChange}: OwnerInfoProps) {
  return (
    <CollapsibleSection title="Omistajan tiedot">
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="name" sx={{ width: 300 }} label="Nimi" value={reg.owner.name || ''} onChange={e => onChange({ owner: { ...reg.owner, name: e.target.value || '' } })} />
          </Grid>
          <Grid item>
            <TextField name="city" sx={{ width: 300 }} label="Kotikunta" value={reg.owner.location || ''} onChange={e => onChange({ owner: { ...reg.owner, location: e.target.value || '' } })} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="email" sx={{ width: 300 }} label="Sähköposti" value={reg.owner.email || ''} onChange={e => onChange({ owner: { ...reg.owner, email: e.target.value || '' } })} />
          </Grid>
          <Grid item>
            <TextField name="phone" sx={{ width: 300 }} label="Puhelin" value={reg.owner.phone || ''} onChange={e => onChange({ owner: { ...reg.owner, phone: e.target.value || '' } })} />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel control={<Checkbox checked={reg.owner.membership} onChange={e => onChange({ owner: { ...reg.owner, membership: e.target.checked } })} />} label="Omistaja on järjestävän yhdistyksen jäsen" />
    </CollapsibleSection>
  );
}
