import { Grid, TextField } from '@mui/material';
import { Registration } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '../..';

type BreederInfoProps = {
  reg: Registration
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
};

export function BreederInfo({ reg, error, helperText, onChange }: BreederInfoProps) {
  const { t } = useTranslation();

  return (
    <CollapsibleSection title={t('registration.breeder')} error={error} helperText={helperText}>
      <Grid item container spacing={1}>
        <Grid item>
          <TextField
            error={!reg.breeder.name}
            id="breeder_name"
            sx={{ width: 300 }}
            label="Nimi"
            value={reg.breeder.name || ''}
            onChange={e => onChange({ breeder: { ...reg.breeder, name: e.target.value || '' } })}
          />
        </Grid>
        <Grid item>
          <TextField
            error={!reg.breeder.location}
            id="breeder_location"
            sx={{ width: 300 }}
            label="Kotikunta"
            value={reg.breeder.location || ''}
            onChange={e => onChange({ breeder: { ...reg.breeder, location: e.target.value || '' } })}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
