import { Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { Registration } from 'koekalenteri-shared/model';
import { CollapsibleSection } from '../..';

type HandlerInfoProps = {
  reg: Registration
  onChange: (props: Partial<Registration>) => void
};

export function HandlerInfo({reg, onChange}: HandlerInfoProps) {
  return (
    <CollapsibleSection title="Ohjaajan tiedot">
      <FormControlLabel control={<Checkbox checked={reg.handler.name === reg.owner.name} onChange={e => onChange({ handler: e.target.checked ? { ...reg.owner } : { name: '', location: '', email: '', phone: '', membership: false }})} />} label="Omistaja ohjaa" />
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="name" sx={{ width: 300 }} label="Nimi" value={reg.handler.name || ''} onChange={e => onChange({ handler: { ...reg.handler, name: e.target.value || '' } })} />
          </Grid>
          <Grid item>
            <TextField name="city" sx={{ width: 300 }} label="Kotikunta" value={reg.handler.location || ''} onChange={e => onChange({ handler: { ...reg.handler, location: e.target.value || '' } })} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="email" sx={{ width: 300 }} label="Sähköposti" value={reg.handler.email || ''} onChange={e => onChange({ handler: { ...reg.handler, email: e.target.value || '' } })} />
          </Grid>
          <Grid item>
            <TextField name="phone" sx={{ width: 300 }} label="Puhelin" value={reg.handler.phone || ''} onChange={e => onChange({ handler: { ...reg.handler, phone: e.target.value || '' } })} />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel control={<Checkbox checked={reg.handler.membership} onChange={e => onChange({ handler: { ...reg.handler, membership: e.target.checked } })} />} label="Ohjaaja on järjestävän yhdistyksen jäsen" />
    </CollapsibleSection>
  );
}
