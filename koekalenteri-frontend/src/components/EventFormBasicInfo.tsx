import { HelpOutlined } from '@mui/icons-material';
import { Fade, FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Popover, Select, TextField } from '@mui/material';
import { Event, EventClass } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateRange } from '.';
import { CollapsibleSection } from './CollapsibleSection';
import { MultiSelect, stringsToMultiSelectOptions } from './MultiSelect';

export function EventFormBasicInfo({ event, onChange }: { event: Partial<Event>; onChange: (props: Partial<Event>) => void; }) {
  const { t } = useTranslation();
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLButtonElement | null>(null);
  const helpOpen = Boolean(helpAnchorEl);
  const eventClasses = (existing: EventClass[], value: string[]) => value.map(c => (existing.find(ec => ec.class === c) || { class: c }));

  return (
    <CollapsibleSection title="Kokeen perustiedot">
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <DateRange
              startLabel="Alkupäivä"
              endLabel="Loppupäivä"
              start={event.startDate || null}
              end={event.endDate || null}
              required
              onChange={(start, end) => onChange({startDate: start || undefined, endDate: end || undefined})}
            />
          </Grid>
          <Grid item>
            <TextField sx={{ width: 300 }} label="Kennelliiton kokeen tunnus" InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={(e) => setHelpAnchorEl(e.currentTarget)}>
                    <HelpOutlined />
                  </IconButton>
                </InputAdornment>
              )
            }} />
            <Popover
              anchorEl={helpAnchorEl}
              open={helpOpen}
              anchorOrigin={{
                vertical: 'center',
                horizontal: 'center',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'left',
              }}
              TransitionComponent={Fade}
              onClose={() => setHelpAnchorEl(null)}
            >
              <Paper sx={{ maxWidth: 400, p: 1, backgroundColor: 'secondary.light' }}>
                Saat Kennelliiton kokeen tunnuksen Oma koirasta, kun koe on anottu ja hyväksytty Kennelliitossa. Kokeen tunnusta tarvitaan tulosten tallentamiseen.
              </Paper>
            </Popover>
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <FormControl sx={{ width: 300 }}>
              <InputLabel id="eventType-label">{t('eventType')}</InputLabel>
              <Select
                labelId="eventType-label"
                id="eventType-select"
                value={event.eventType}
                label={t('eventType')}
                onChange={(e) => onChange({ eventType: e.target.value })}
              >
                {['NOU', 'NOME-B', 'NOME-A', 'NOWT'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item>
            <FormControl sx={{ width: 300 }}>
              <InputLabel id="class-label">{t("eventClass")}</InputLabel>
              <MultiSelect
                id="class"
                labelId="class-label"
                label="Koeluokat"
                value={(event.classes || []).map(c => typeof c === 'string' ? c : c.class)}
                options={stringsToMultiSelectOptions(['ALO', 'AVO', 'VOI'])}
                onChange={(value) => onChange({ classes: eventClasses(event.classes || [], value) })} />
            </FormControl>
          </Grid>
        </Grid>
        <Grid item sx={{ width: 616 }}>
          <TextField label="Tapahtuman nimi" fullWidth value={event.name || ''} onChange={(e) => onChange({ name: e.target.value })} />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
