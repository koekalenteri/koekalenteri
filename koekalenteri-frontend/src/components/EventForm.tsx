import { Cancel, Save } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, Stack, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { makeStyles } from '@mui/styles';
import type { Event } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { EventFormBasicInfo } from './EventFormBasicInfo';

const useStyles = makeStyles(theme => ({
  root: {
    backgroundColor: theme.palette.background.form,
    '& .MuiInputBase-root': {
      backgroundColor: theme.palette.background.default
    }
  }
}));

export type EventHandler = (event: Partial<Event>) => void;

export function EventForm({ event, onSave, onCancel }: { event: Partial<Event>, onSave: EventHandler, onCancel: EventHandler }) {
  const classes = useStyles();
  const [local, setLocal] = useState({ ...event });
  const [saving, setSaving] = useState(false);
  const onChange = (props: Partial<Event>) => setLocal({ ...local, ...props });
  const saveHandler = () => {
    setSaving(true);
    onSave(local);
  }
  const cancelHandler = () => onCancel(local);

  return (
    <>
      <Stepper activeStep={0} sx={{ my: 2 }}>
        <Step><StepLabel>Luonnos</StepLabel></Step>
        <Step><StepLabel>Alustava</StepLabel></Step>
        <Step><StepLabel optional={(<Typography variant="caption" color="error">Tietoja puuttuu</Typography>)}>Julkaistu</StepLabel></Step>
        <Step><StepLabel>Ilmoittautuminen</StepLabel></Step>
        <Step><StepLabel>Käynnissä</StepLabel></Step>
        <Step><StepLabel>Päättynyt</StepLabel></Step>
      </Stepper>

      <Box className={classes.root} sx={{ pb: 0.5 }}>
        <EventFormBasicInfo event={local} onChange={onChange} />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{mt: 1}}>
        <LoadingButton color="primary" loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </>
  );
}
