import type { PublicContactInfo } from '../../../../../types'

import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'

interface Props {
  readonly contact: 'official' | 'secretary'
  readonly show?: Partial<PublicContactInfo>
}

export default function ContactInfoDisplay({ contact, show }: Props) {
  const { t } = useTranslation()
  if (!show?.name && !show?.email && !show?.phone) {
    return null
  }
  return (
    <Grid item container direction="row" justifyContent="space-around">
      <Grid item xs>
        <b>{t(`event.${contact}`)}</b>
      </Grid>
      <Grid item xs>
        {show.name}
      </Grid>
      <Grid item xs>
        {show.email}
      </Grid>
      <Grid item xs>
        {show.phone}
      </Grid>
    </Grid>
  )
}
