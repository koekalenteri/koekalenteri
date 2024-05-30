import { useTranslation } from 'react-i18next'
import Typography from '@mui/material/Typography'

interface Props {
  date?: Date
}

export const TimeLeft = ({ date }: Props) => {
  const { t } = useTranslation()

  if (!date) return null

  return (
    <Typography display="inline" ml={1}>
      {t('dateFormat.distanceLeft', { date })}
    </Typography>
  )
}
