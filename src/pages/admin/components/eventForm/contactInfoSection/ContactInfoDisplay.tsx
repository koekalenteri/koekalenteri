import type { PublicContactInfo } from '../../../../../types'

import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'

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
    <Grid2 container direction="row" justifyContent="space-around">
      <Grid2>
        <b>{t(`event.${contact}`)}</b>
      </Grid2>
      <Grid2>{show.name}</Grid2>
      <Grid2>{show.email}</Grid2>
      <Grid2>{show.phone}</Grid2>
    </Grid2>
  )
}
