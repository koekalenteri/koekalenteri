import { useEffect } from 'react'
import { useLocation } from 'react-router'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'

import { rum } from '../lib/client/rum'

import Header from './components/Header'

const issueHref = 'https://koekalenteri.atlassian.net/servicedesk/customer/portal/1/group/1/create/1'
const supportEmail = 'support@koekalenteri.atlassian.net'

export const SupportPage = () => {
  const location = useLocation()

  useEffect(() => {
    rum()?.recordPageView(location.pathname)
  }, [location])

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto', mt: '36px' }}>
          <Typography variant="h6">
            Huomasitko, että koekalenteri toimii oudosti tai ei toimi niinkuin pitää?
          </Typography>
          <Typography variant="h6">
            Voit lähettää virheraporting suoraan <Link href={issueHref}>täältä</Link>
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
