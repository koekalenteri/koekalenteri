import { useTranslation } from 'react-i18next'
import { Box } from '@mui/material'

export function EmptyResult() {
  const { t } = useTranslation()
  return <Box sx={{ width: '100%', textAlign: 'center' }}>{t('noResults')}</Box>
}
