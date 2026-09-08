import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { HEADER_HEIGHT } from '../assets/Theme'
import { recordPageView } from '../lib/client/rum'
import { SUPPORT_REQUEST_URL as issueHref, SUPPORT_EMAIL as supportEmail } from '../lib/client/support'
import Header from './components/Header'

export const SupportPage = () => {
  const location = useLocation()

  useEffect(() => {
    recordPageView(location.pathname)
  }, [location])

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, mt: HEADER_HEIGHT, overflow: 'auto', p: 1 }}>
          <Typography variant="h6">
            Huomasitko, että koekalenteri toimii oudosti tai ei toimi niinkuin pitää?
          </Typography>
          <Typography variant="h6">
            Voit lähettää virheraportin suoraan <Link href={issueHref}>täältä</Link>
          </Typography>
          <Typography variant="h6">
            Tai voit lähettää sähköpostia osoitteeseen{' '}
            <Link href={`mailto:${supportEmail}?subject="Palaute`}>{supportEmail}</Link>
          </Typography>
        </Box>
      </Box>
    </>
  )
}
