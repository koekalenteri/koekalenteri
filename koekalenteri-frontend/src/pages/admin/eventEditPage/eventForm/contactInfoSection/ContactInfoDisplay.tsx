import { useTranslation } from 'react-i18next'
import { Grid } from '@mui/material'
import { Person, ShowContactInfo } from 'koekalenteri-shared/model'

interface Props {
  contact: 'official' | 'secretary'
  person?: Partial<Person>
  show?: Partial<ShowContactInfo>
}

export default function ContactInfoDisplay({ contact, person, show }: Props) {
  const { t } = useTranslation()
  if (!person || !show || (!show.name && !show.email && !show.phone)) {
    return null
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
