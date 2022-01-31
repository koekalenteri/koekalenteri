import { Cancel, Save } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { makeStyles } from '@mui/styles';
import type { Event, EventState, Judge } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EventFormAdditionalInfo } from './EventFormAdditionalInfo';
import { EventFormBasicInfo } from './EventFormBasicInfo';
import { EventFormJudges } from './EventFormJudges';

const useStyles = makeStyles(theme => ({
  root: {
    backgroundColor: theme.palette.background.form,
    '& .MuiInputBase-root': {
      backgroundColor: theme.palette.background.default
    }
  }
}));

export type EventHandler = (event: Partial<Event>) => void;

export function EventForm({ event, judges, onSave, onCancel }: { event: Partial<Event>, judges: Judge[], onSave: EventHandler, onCancel: EventHandler }) {
  const classes = useStyles();
  const { t } = useTranslation();
  const [local, setLocal] = useState({ classes: [], judges: [], ...event });
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState(false);
  const onChange = (props: Partial<Event>) => {
    setLocal({ ...local, ...props });
    setChanges(true);
  }
  const saveHandler = () => {
    setSaving(true);
    onSave(local);
  }
  const cancelHandler = () => onCancel(local);

  return (
    <>
      <FormControl>
        <InputLabel id="demo-simple-select-label">{t('state')}</InputLabel>
        <Select
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={local.state || 'draft'}
          label={t('state')}
          onChange={(e) => onChange({state: (e.target.value || 'draft') as EventState})}
        >
          <MenuItem value="draft">{t('draft', { ns: 'states'})}</MenuItem>
          <MenuItem value="tentative">{t('tentative', { ns: 'states' })}</MenuItem>
          <MenuItem value="confirmed">{t('confirmed', { ns: 'states' })}</MenuItem>
          <MenuItem value="cancelled">{t('cancelled', { ns: 'states' })}</MenuItem>
        </Select>
      </FormControl>

      <Box className={classes.root} sx={{ pb: 0.5 }}>
        <EventFormBasicInfo event={local} onChange={onChange} />
        <EventFormJudges event={local} judges={judges} onChange={onChange} />
        <EventFormAdditionalInfo event={local} onChange={onChange} />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{mt: 1}}>
        <LoadingButton color="primary" disabled={!changes} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </>
  );
}
