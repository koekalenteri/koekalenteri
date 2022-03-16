import { Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { Registration } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '../..';

type OwnerInfoProps = {
  reg: Registration
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
};

export function OwnerInfo({reg, error, helperText, onChange}: OwnerInfoProps) {
  const { t } = useTranslation();

  return (
    <CollapsibleSection title={t('registration.owner')} error={error} helperText={helperText}>
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'name' }}
              error={!reg.owner.name}
              fullWidth
              id="owner_name"
              label={t('registration.contact.name')}
              name="name"
              onChange={e => onChange({ owner: { ...reg.owner, name: e.target.value || '' } })}
              value={reg.owner.name || ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'address-level2' }}
              error={!reg.owner.location}
              fullWidth
              id="owner_city"
              label={t('registration.contact.city')}
              name="city"
              onChange={e => onChange({ owner: { ...reg.owner, location: e.target.value || '' } })}
              value={reg.owner.location || ''}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'email' }}
              error={!reg.owner.email}
              fullWidth
              id="owner_email"
              label={t('registration.contact.email')}
              name="email"
              onChange={e => onChange({ owner: { ...reg.owner, email: e.target.value || '' } })}
              value={reg.owner.email || ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'tel' }}
              error={!reg.owner.phone}
              fullWidth
              id="owner_phone"
              label={t('registration.contact.phone')}
              name="phone"
              onChange={e => onChange({ owner: { ...reg.owner, phone: e.target.value || '' } })}
              value={reg.owner.phone || ''}
            />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel control={<Checkbox checked={reg.owner.membership} onChange={e => onChange({ owner: { ...reg.owner, membership: e.target.checked } })} />} label={t('registration.ownerIsMember')} />
    </CollapsibleSection>
  );
}
