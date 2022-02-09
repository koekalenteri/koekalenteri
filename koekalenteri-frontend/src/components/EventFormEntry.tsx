import { Grid } from '@mui/material';
import { Event } from 'koekalenteri-shared/model';
import { CollapsibleSection, DateRange } from '.';

export function EventFormEntry({ event, onChange }: { event: Partial<Event>; onChange: (props: Partial<Event>) => void; }) {
  return (
    <CollapsibleSection title="Ilmoittautuminen">
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <DateRange
              startLabel="Ilmoittautumisaika alkaa"
              endLabel="Ilmoittautumisaika päättyy"
              start={event.entryStartDate || null}
              end={event.entryEndDate || null}
              range={{start: new Date(), end: event.startDate}}
              required={false}
              onChange={(start, end) => onChange({entryStartDate: start || undefined, entryEndDate: end || undefined})}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          Koepaikat
        </Grid>
        <Grid item container spacing={1}>
          Jäsenet
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
