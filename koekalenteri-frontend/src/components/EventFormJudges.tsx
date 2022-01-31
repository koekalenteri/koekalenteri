import { FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { Event, Judge } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from './CollapsibleSection';

export function EventFormJudges({ event, judges, onChange }: { event: Partial<Event>, judges: Judge[], onChange: (props: Partial<Event>) => void }) {
  const { t } = useTranslation();

  return (
    <CollapsibleSection title={t('judges')}>
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <FormControl sx={{ width: 300 }}>
              <InputLabel id="headJudge-label">Päätuomari</InputLabel>
              <Select
                labelId="eventType-label"
                id="eventType-select"
                value={event.judges ? event.judges[0] || '' : ''}
                label="Päätuomari"
                onChange={(e) => onChange({ judges: [e.target.value as number].concat((event.judges || []).slice(1)) })}
              >
                {judges.map((judge) => <MenuItem key={judge.id} value={judge.id}>{judge.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
