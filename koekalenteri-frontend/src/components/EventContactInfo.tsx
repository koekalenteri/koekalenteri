import { Grid } from '@mui/material';
import type { Person, ShowContactInfo } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { PartialEvent } from './forms/EventForm';

export function EventContactInfo({ event }: { event: PartialEvent }) {
  return (
    <Grid container rowSpacing={1}>
      <ContactInfo contact='official' person={event.official} show={event.contactInfo?.official} />
      <ContactInfo contact='secretary' person={event.secretary} show={event.contactInfo?.secretary} />
    </Grid>
  );
}

function ContactInfo({ contact, person, show }: { contact: 'official'|'secretary', person?: Person, show?: Partial<ShowContactInfo> }) {
  const { t } = useTranslation();
  if (!person || !show || (!show.name && !show.email && !show.phone)) {
    return (<></>);
  }
  return (
    <Grid item container direction="row" justifyContent="space-around">
      <Grid item xs><b>{t(`event.${contact}`)}</b></Grid>
      <Grid item xs>{show?.name ? person.name : ''}</Grid>
      <Grid item xs>{show?.email ? person.email : ''}</Grid>
      <Grid item xs>{show?.phone ? person.phone : ''}</Grid>
    </Grid>
  )
}
