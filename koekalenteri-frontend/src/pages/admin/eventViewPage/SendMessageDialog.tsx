import { useTranslation } from 'react-i18next'
import { CheckBox } from '@mui/icons-material'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormGroup, FormLabel, Paper, Stack, TextField, Typography } from '@mui/material'
import { Event, Language } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import AutocompleteSingle from '../../components/AutocompleteSingle'
import { messageTemplatesSelector } from '../recoil/messages/selectors'

interface Props {
  open: boolean
  event: Event
  onClose?: () => void
}

export default function SendMessageDialog({ open, onClose }: Props) {
  const { i18n, t } = useTranslation()
  const templates = useRecoilValue(messageTemplatesSelector)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Viestin lähettäminen</DialogTitle>
      <DialogContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{ width: '50%' }}>
            <Typography variant="h5">Viesti</Typography>

            <Paper sx={{ width: '100%', p: 1, bgcolor: 'background.form' }}>
              <AutocompleteSingle
                getOptionLabel={(o) => o.name[i18n.language as Language]}
                options={templates}
                label={'Viestin tyyppi'}
              />
              <FormControl component="fieldset" sx={{ my: 1 }}>
                <FormLabel component="legend">Yhteystiedot:</FormLabel>
                <FormGroup sx={{ mx: 2, my: 1 }}>
                  <FormControlLabel control={<CheckBox name='official' />} label={t('event.official')} />
                  <FormControlLabel control={<CheckBox name='secretary' />} label={t('event.secretary')} />
                </FormGroup>
              </FormControl>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">Voit lisätä tähän halutessasi lisäviestin:</FormLabel>
                <TextField fullWidth multiline rows={4} />
              </FormControl>
            </Paper>
          </Box>
          <Box sx={{ width: '50%' }}>
            <Typography variant="h5">Esikatselu</Typography>
            <Paper sx={{ width: '100%', p: 1 }}>(todo)</Paper>
          </Box>
        </Stack>

      </DialogContent>
      <DialogActions>
        <Button variant="contained">Lähetä</Button>
        <Button variant="outlined" onClick={onClose}>Peruuta</Button>
      </DialogActions>
    </Dialog>
  )
}
