import { Checkbox, FormControlLabel, FormGroup, Grid } from "@mui/material";
import { ContactInfo, Event, ShowContactInfo } from "koekalenteri-shared/model";
import { useTranslation } from "react-i18next";
import { CollapsibleSection, PartialEvent } from ".";
import { EventContactInfo } from "./EventContactInfo";

export function EventFormContactInfo({ event, onChange }: { event: PartialEvent; onChange: (props: Partial<Event>) => void; }) {
  const { t } = useTranslation();
  const handleChange = (props: Partial<ContactInfo>) => onChange({ contactInfo: { ...(event.contactInfo || {}), ...props } });

  return (
    <CollapsibleSection title={t('contactInfo')}>
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <PersonContactInfo contact='official' show={event.contactInfo?.official} onChange={handleChange} />
          </Grid>
          <Grid item>
            <PersonContactInfo contact='secretary' show={event.contactInfo?.secretary} onChange={handleChange} />
          </Grid>
        </Grid>
      </Grid>
      <hr />
      <EventContactInfo event={event} />
    </CollapsibleSection>
  );
}

function PersonContactInfo({contact, show, onChange}: { contact: 'official'|'secretary', show?: Partial<ShowContactInfo>, onChange: (props: Partial<ContactInfo>) => void }) {
  const { t } = useTranslation();
  const handleChange = (props: Partial<ShowContactInfo>) => onChange({ [contact]: {...show, ...props} });

  return (
    <>
      {t(contact)}
      <FormGroup row>
        <FormControlLabel
          control={<Checkbox checked={!!show?.name} onChange={e => handleChange({ name: e.target.checked })} />}
          label="Nimi"
        />
        <FormControlLabel
          control={<Checkbox checked={!!show?.email} onChange={e => handleChange({ email: e.target.checked })} />}
          label="Sähköposti"
        />
        <FormControlLabel
          control={<Checkbox checked={!!show?.phone} onChange={e => handleChange({ phone: e.target.checked })} />}
          label="Puhelin"
        />
      </FormGroup>
    </>
  );
}
