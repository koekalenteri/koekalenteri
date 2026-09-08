import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useParams } from 'react-router'
import { HEADER_HEIGHT } from '../assets/Theme'
import { docsPageFor } from '../lib/client/docs'
import { Path } from '../routeConfig'
import { DocsBody } from './components/DocsBody'
import Header from './components/Header'

export const DocsPage = () => {
  const { i18n, t } = useTranslation()
  const params = useParams()
  const page = docsPageFor(i18n.language, params['*'] ?? '')

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <Box
          sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxWidth: 900, mt: HEADER_HEIGHT, p: 2 }}
          data-testid="docs-page"
        >
          <Link component={RouterLink} to={Path.docs} variant="body2" sx={{ mb: 1 }}>
            {t('docs.title')}
          </Link>
          {page ? (
            <>
              <Typography variant="h4" component="h1">
                {page.title}
              </Typography>
              <DocsBody html={page.html} />
            </>
          ) : (
            <Typography variant="h6" component="h1">
              {t('docs.notFound')}
            </Typography>
          )}
        </Box>
      </Box>
    </>
  )
}
