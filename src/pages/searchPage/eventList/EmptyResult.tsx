import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'

export function EmptyResult() {
  const { t } = useTranslation()
  return <Box sx={{ textAlign: 'center', width: '100%' }}>{t('noResults')}</Box>
}
